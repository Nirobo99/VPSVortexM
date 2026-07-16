"""Official support account helpers and purchase/expiry notifications."""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.messaging import Dialog, DialogParticipant, DialogType, MessageType
from app.models.user import User, UserRole
from app.services.messaging_service import MessagingService

logger = logging.getLogger(__name__)

SUPPORT_USERNAME = "VortexM Поддержка"
SUPPORT_EMAIL = "vortexm.info@vortexm.ru"
SUPPORT_DISPLAY = "VortexM Поддержка"

# Notify when remaining seats are at/below this many, or fill ratio >= 90%.
GROUP_CAPACITY_REMAINING = 25
GROUP_CAPACITY_RATIO = 0.9
# Invisible expiry reminders (days before end).
INVISIBLE_REMIND_DAYS = (3, 1)


class SupportNotifyService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.messaging = MessagingService(db)

    @staticmethod
    async def ensure_support_user(db: AsyncSession) -> User:
        result = await db.execute(select(User).where(User.username == SUPPORT_USERNAME))
        user = result.scalar_one_or_none()
        if user:
            changed = False
            if not user.is_official_verified:
                user.is_official_verified = True
                changed = True
            if not user.is_verified:
                user.is_verified = True
                changed = True
            if not user.is_active:
                user.is_active = True
                changed = True
            if changed:
                await db.commit()
                await db.refresh(user)
            return user

        # Unique email if already taken.
        email = SUPPORT_EMAIL
        email_exists = await db.execute(select(User.id).where(User.email == email))
        if email_exists.scalar_one_or_none():
            email = f"support+{secrets.token_hex(4)}@vortexm.ru"

        user = User(
            username=SUPPORT_USERNAME,
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            display_name=SUPPORT_DISPLAY,
            role=UserRole.USER,
            is_active=True,
            is_verified=True,
            is_official_verified=True,
            locale="ru",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("Created official support user %s", SUPPORT_USERNAME)
        return user

    async def send_to_user(self, target: User, content: str) -> None:
        if target.username == SUPPORT_USERNAME:
            return
        support = await self.ensure_support_user(self.db)
        try:
            dialog = await self.messaging.get_or_create_dialog(support, target, is_secret=False)
            await self.messaging.send_message(
                support,
                dialog.id,
                MessageType.TEXT,
                content=content,
            )
        except Exception:
            logger.exception("Failed to send support notification to %s", target.username)
            try:
                await self.db.rollback()
            except Exception:
                pass

    async def notify_purchase(self, user: User, feature_name: str, details: str | None = None) -> None:
        extra = f"\n{details}" if details else ""
        text = (
            f"✅ Спасибо за покупку!\n\n"
            f"Вы приобрели: {feature_name}.{extra}\n\n"
            f"Если нужна помощь — напишите нам в этот чат.\n"
            f"С уважением, команда VortexM."
        )
        await self.send_to_user(user, text)

    async def notify_invisible_expiring(self, user: User, days_left: int, until: datetime) -> None:
        when = until.astimezone(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
        text = (
            f"⏰ Напоминание о подписке «Невидимка»\n\n"
            f"Срок действия заканчивается через {days_left} дн. ({when}).\n"
            f"Чтобы продлить, откройте Кошелёк → Платные функции → Невидимка:\n"
            f"https://vortexm.ru/wallet\n\n"
            f"С уважением, VortexM Поддержка."
        )
        await self.send_to_user(user, text)

    async def notify_group_capacity(self, admin: User, dialog: Dialog, member_count: int) -> None:
        title = dialog.title or "Беседа"
        remaining = max(0, int(dialog.member_limit) - int(member_count))
        text = (
            f"⚠️ Беседа «{title}» почти заполнена\n\n"
            f"Участников: {member_count} из {dialog.member_limit} (осталось мест: {remaining}).\n"
            f"Новые пользователи скоро не смогут вступить.\n\n"
            f"Чтобы увеличить лимит до 1000, купите пакет расширения:\n"
            f"https://vortexm.ru/wallet\n\n"
            f"С уважением, VortexM Поддержка."
        )
        await self.send_to_user(admin, text)


async def run_subscription_reminders(db: AsyncSession) -> dict:
    """Send invisible-expiry reminders and group capacity warnings."""
    from app.core.redis_client import get_redis

    svc = SupportNotifyService(db)
    await SupportNotifyService.ensure_support_user(db)
    now = datetime.now(timezone.utc)
    redis = await get_redis()
    sent_invisible = 0
    sent_capacity = 0

    for days in INVISIBLE_REMIND_DAYS:
        window_start = now + timedelta(days=days) - timedelta(hours=12)
        window_end = now + timedelta(days=days) + timedelta(hours=12)
        result = await db.execute(
            select(User).where(
                User.invisible_until.is_not(None),
                User.invisible_until >= window_start,
                User.invisible_until <= window_end,
                User.is_active.is_(True),
            )
        )
        for user in result.scalars().all():
            if not user.invisible_until:
                continue
            key = f"notify:invisible:{user.id}:{days}:{user.invisible_until.date().isoformat()}"
            if await redis.get(key):
                continue
            await svc.notify_invisible_expiring(user, days, user.invisible_until)
            await redis.set(key, "1", ex=60 * 60 * 24 * 7)
            sent_invisible += 1

    # Groups near capacity — notify owner + admins once per day.
    groups = await db.execute(
        select(Dialog).where(
            Dialog.dialog_type == DialogType.GROUP,
            Dialog.is_paid_extended.is_(False),
        )
    )
    for dialog in groups.scalars().all():
        count_res = await db.execute(
            select(func.count()).select_from(DialogParticipant).where(DialogParticipant.dialog_id == dialog.id)
        )
        count = int(count_res.scalar() or 0)
        limit = int(dialog.member_limit or 500)
        remaining = limit - count
        full_enough = remaining <= GROUP_CAPACITY_REMAINING or (limit > 0 and count / limit >= GROUP_CAPACITY_RATIO)
        if not full_enough or count <= 0:
            continue
        key = f"notify:groupcap:{dialog.id}:{now.date().isoformat()}"
        if await redis.get(key):
            continue
        admins = await db.execute(
            select(User)
            .join(DialogParticipant, DialogParticipant.user_id == User.id)
            .where(
                DialogParticipant.dialog_id == dialog.id,
                or_(
                    DialogParticipant.role == "owner",
                    DialogParticipant.is_admin.is_(True),
                ),
            )
        )
        notified_ids: set[uuid.UUID] = set()
        for admin in admins.scalars().all():
            if admin.id in notified_ids:
                continue
            notified_ids.add(admin.id)
            await svc.notify_group_capacity(admin, dialog, count)
            sent_capacity += 1
        await redis.set(key, "1", ex=60 * 60 * 26)

    return {"invisible": sent_invisible, "capacity": sent_capacity}
