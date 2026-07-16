import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.channels import DEFAULT_MEMBER_LIMIT, EXTENDED_MEMBER_LIMIT, GROUP_EXTENSION_PRICE
from app.models.messaging import Dialog, DialogParticipant, DialogType
from app.models.user import User
from app.services.messaging_service import MessagingService
from app.services.storage_service import StorageService
from app.services.ws_manager import ws_manager

# Fixed ban presets: reason code → (hours or None forever, display label for message)
GROUP_BAN_PRESETS: dict[str, tuple[int | None, str]] = {
    "spam": (12, "СПАМ"),
    "ads": (24, "Не согласованная реклама"),
    "disrespect": (
        None,
        "Не уважение к участникам и администрации а так же за многочисленые жалобы",
    ),
}


class ConversationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.messaging = MessagingService(db)

    async def create_group(
        self,
        owner: User,
        title: str,
        description: str | None,
        member_usernames: list[str],
        is_public: bool = True,
    ) -> dict:
        if len(member_usernames) > DEFAULT_MEMBER_LIMIT - 1:
            raise ValueError("member_limit_exceeded")

        dialog = Dialog(
            dialog_type=DialogType.GROUP,
            title=title,
            description=description,
            owner_id=owner.id,
            member_limit=DEFAULT_MEMBER_LIMIT,
        )
        # is_public may be absent until migration 015/016 applies.
        if hasattr(Dialog, "is_public"):
            try:
                dialog.is_public = is_public
            except Exception:
                pass
        self.db.add(dialog)
        await self.db.flush()

        self.db.add(
            DialogParticipant(
                dialog_id=dialog.id,
                user_id=owner.id,
                role="owner",
                is_admin=True,
                can_post=True,
                can_invite=True,
                can_moderate=True,
            )
        )

        added = 1
        for username in member_usernames:
            if username == owner.username:
                continue
            result = await self.db.execute(select(User).where(User.username == username))
            member = result.scalar_one_or_none()
            if not member:
                raise ValueError("user_not_found")
            if await self.messaging._is_blocked(owner.id, member.id):
                raise ValueError("user_blocked")
            self.db.add(
                DialogParticipant(
                    dialog_id=dialog.id,
                    user_id=member.id,
                    role="member",
                    can_post=True,
                )
            )
            added += 1

        if added > dialog.member_limit:
            raise ValueError("member_limit_exceeded")

        await self.db.commit()
        await self.db.refresh(dialog)

        await ws_manager.publish_many(
            [str(uid) for uid in await self._member_ids(dialog.id) if uid != owner.id],
            {"type": "group_invite", "data": {"dialog_id": str(dialog.id), "title": title}},
        )

        return await self._group_dict(dialog, viewer_id=owner.id)

    async def _member_ids(self, dialog_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.db.execute(
            select(DialogParticipant.user_id).where(DialogParticipant.dialog_id == dialog_id)
        )
        return [row[0] for row in result.all()]

    async def list_groups(self, user: User) -> list[dict]:
        result = await self.db.execute(
            select(Dialog, func.count(DialogParticipant.id))
            .join(DialogParticipant, DialogParticipant.dialog_id == Dialog.id)
            .where(DialogParticipant.user_id == user.id, Dialog.dialog_type == DialogType.GROUP)
            .group_by(Dialog.id)
        )
        items = []
        for dialog, count in result.all():
            d = await self._group_dict(dialog, count, viewer_id=user.id)
            items.append(d)
        return items

    async def search_public_groups(self, user: User, query: str | None = None) -> list[dict]:
        try:
            q = select(Dialog).where(Dialog.dialog_type == DialogType.GROUP, Dialog.is_public.is_(True))
            if query:
                like = f"%{query.strip()}%"
                q = q.where(Dialog.title.ilike(like) | Dialog.description.ilike(like))
            result = await self.db.execute(q.order_by(Dialog.created_at.desc()).limit(50))
            items = []
            for dialog in result.scalars().all():
                items.append(await self._group_dict(dialog, viewer_id=user.id))
            return items
        except Exception:
            # Column is_public may be missing before migrations finish.
            return []

    async def get_group(self, user: User, dialog_id: uuid.UUID) -> dict:
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id, Dialog.dialog_type == DialogType.GROUP))
        dialog = result.scalar_one_or_none()
        if not dialog:
            raise ValueError("group_not_found")
        is_member = await self.messaging._get_participant(dialog_id, user.id) is not None
        if not is_member and not dialog.is_public:
            raise ValueError("group_private")
        count_res = await self.db.execute(
            select(func.count()).select_from(DialogParticipant).where(DialogParticipant.dialog_id == dialog_id)
        )
        return await self._group_dict(dialog, count_res.scalar() or 0, viewer_id=user.id)

    async def join_group(self, user: User, dialog_id: uuid.UUID) -> dict:
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id, Dialog.dialog_type == DialogType.GROUP))
        dialog = result.scalar_one_or_none()
        if not dialog:
            raise ValueError("group_not_found")
        if not dialog.is_public:
            raise ValueError("group_private")
        existing = await self.messaging._get_participant(dialog_id, user.id)
        if existing:
            return await self.get_group(user, dialog_id)
        count_res = await self.db.execute(
            select(func.count()).select_from(DialogParticipant).where(DialogParticipant.dialog_id == dialog_id)
        )
        current = count_res.scalar() or 0
        if current >= dialog.member_limit:
            raise ValueError("member_limit_exceeded")
        self.db.add(
            DialogParticipant(dialog_id=dialog_id, user_id=user.id, role="member", can_post=True)
        )
        await self.db.commit()
        return await self.get_group(user, dialog_id)

    async def leave_group(self, user: User, dialog_id: uuid.UUID) -> None:
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id, Dialog.dialog_type == DialogType.GROUP))
        dialog = result.scalar_one_or_none()
        if not dialog:
            raise ValueError("group_not_found")
        participant = await self.messaging._get_participant(dialog_id, user.id)
        if not participant:
            raise ValueError("not_member")
        if participant.role == "owner" or dialog.owner_id == user.id:
            raise ValueError("owner_cannot_leave")
        await self.db.delete(participant)
        await self.db.commit()

    async def update_group(
        self,
        user: User,
        dialog_id: uuid.UUID,
        title: str | None = None,
        description: str | None = None,
        is_public: bool | None = None,
    ) -> dict:
        participant = await self.messaging._require_participant(dialog_id, user.id)
        if not participant.is_admin and participant.role != "owner":
            raise ValueError("no_permission")
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id, Dialog.dialog_type == DialogType.GROUP))
        dialog = result.scalar_one_or_none()
        if not dialog:
            raise ValueError("group_not_found")
        if title is not None:
            cleaned = title.strip()
            if not cleaned:
                raise ValueError("invalid_title")
            dialog.title = cleaned
        if description is not None:
            dialog.description = description.strip() or None
        if is_public is not None:
            dialog.is_public = is_public
        await self.db.commit()
        return await self.get_group(user, dialog_id)

    async def _group_dict(
        self,
        dialog: Dialog,
        member_count: int | None = None,
        viewer_id: uuid.UUID | None = None,
    ) -> dict:
        if member_count is None:
            count_res = await self.db.execute(
                select(func.count()).select_from(DialogParticipant).where(DialogParticipant.dialog_id == dialog.id)
            )
            member_count = count_res.scalar() or 0
        is_member = False
        if viewer_id is not None:
            is_member = await self.messaging._get_participant(dialog.id, viewer_id) is not None
        return {
            "id": str(dialog.id),
            "title": dialog.title,
            "description": dialog.description,
            "avatar_url": StorageService.generate_presigned_url(dialog.avatar_url),
            "owner_id": str(dialog.owner_id) if dialog.owner_id else None,
            "member_count": member_count,
            "member_limit": dialog.member_limit,
            "is_paid_extended": dialog.is_paid_extended,
            "is_public": bool(getattr(dialog, "is_public", False)),
            "is_member": is_member,
            "is_owner": bool(viewer_id and dialog.owner_id == viewer_id),
            "created_at": dialog.created_at.isoformat(),
        }

    async def add_members(self, user: User, dialog_id: uuid.UUID, usernames: list[str]) -> dict:
        participant = await self.messaging._require_participant(dialog_id, user.id)
        if not participant.can_invite and not participant.is_admin:
            raise ValueError("no_permission")

        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id, Dialog.dialog_type == DialogType.GROUP))
        dialog = result.scalar_one_or_none()
        if not dialog:
            raise ValueError("group_not_found")

        count_res = await self.db.execute(
            select(func.count()).select_from(DialogParticipant).where(DialogParticipant.dialog_id == dialog_id)
        )
        current = count_res.scalar() or 0

        for username in usernames:
            if current >= dialog.member_limit:
                raise ValueError("member_limit_exceeded")
            u_res = await self.db.execute(select(User).where(User.username == username))
            member = u_res.scalar_one_or_none()
            if not member:
                raise ValueError("user_not_found")
            if await self.messaging._is_blocked(user.id, member.id):
                raise ValueError("user_blocked")
            existing = await self.messaging._get_participant(dialog_id, member.id)
            if existing:
                continue
            self.db.add(DialogParticipant(dialog_id=dialog_id, user_id=member.id, role="member", can_post=True))
            current += 1
            await ws_manager.publish(
                str(member.id),
                {"type": "group_invite", "data": {"dialog_id": str(dialog_id), "title": dialog.title}},
            )

        await self.db.commit()
        return await self.get_group(user, dialog_id)

    async def extend_limit(self, user: User, dialog_id: uuid.UUID) -> dict:
        participant = await self.messaging._require_participant(dialog_id, user.id)
        if not participant.is_admin and participant.role != "owner":
            raise ValueError("no_permission")
        result = await self.db.execute(select(Dialog).where(Dialog.id == dialog_id))
        dialog = result.scalar_one()
        if dialog.is_paid_extended:
            raise ValueError("already_extended")
        vmoney = int(getattr(user, "vmoney_balance", 0) or 0)
        if vmoney < GROUP_EXTENSION_PRICE:
            raise ValueError("insufficient_balance")
        user.vmoney_balance = vmoney - GROUP_EXTENSION_PRICE
        dialog.member_limit = EXTENDED_MEMBER_LIMIT
        dialog.is_paid_extended = True
        await self.db.commit()
        return await self.get_group(user, dialog_id)

    async def set_admin(self, user: User, dialog_id: uuid.UUID, target_user_id: uuid.UUID, is_admin: bool) -> None:
        actor = await self.messaging._require_participant(dialog_id, user.id)
        if not actor.is_admin and actor.role != "owner":
            raise ValueError("no_permission")
        target = await self.messaging._get_participant(dialog_id, target_user_id)
        if not target:
            raise ValueError("not_member")
        if target.role == "owner":
            raise ValueError("no_permission")
        if actor.role != "owner" and actor.user_id != target_user_id:
            raise ValueError("no_permission")
        target.is_admin = is_admin
        target.can_invite = is_admin
        target.can_moderate = is_admin
        target.role = "admin" if is_admin else "member"
        await self.db.commit()

    async def upload_avatar(self, user: User, dialog_id: uuid.UUID, content: bytes, content_type: str) -> dict:
        participant = await self.messaging._require_participant(dialog_id, user.id)
        if not participant.is_admin and participant.role != "owner":
            raise ValueError("no_permission")
        result = await self.db.execute(
            select(Dialog).where(Dialog.id == dialog_id, Dialog.dialog_type == DialogType.GROUP)
        )
        dialog = result.scalar_one_or_none()
        if not dialog:
            raise ValueError("group_not_found")
        if dialog.avatar_url:
            StorageService.delete_by_url(dialog.avatar_url)
        dialog.avatar_url = StorageService.upload_group_avatar(dialog.id, content, content_type)
        await self.db.commit()
        return await self.get_group(user, dialog_id)

    async def list_members(self, user: User, dialog_id: uuid.UUID) -> list[dict]:
        await self.messaging._require_participant(dialog_id, user.id)
        result = await self.db.execute(
            select(User, DialogParticipant)
            .join(DialogParticipant, DialogParticipant.user_id == User.id)
            .where(DialogParticipant.dialog_id == dialog_id)
            .order_by(DialogParticipant.joined_at.asc())
        )
        out = []
        now = datetime.now(timezone.utc)
        for u, p in result.all():
            banned, reason, until = self._ban_status(p, now)
            out.append(
                {
                    "user_id": str(u.id),
                    "username": u.username,
                    "display_name": u.display_name,
                    "avatar_url": StorageService.generate_presigned_url(u.avatar_url),
                    "role": p.role,
                    "is_admin": p.is_admin,
                    "is_banned": banned,
                    "ban_reason": reason,
                    "banned_until": until.isoformat() if until else None,
                }
            )
        return out

    @staticmethod
    def _ban_status(
        participant: DialogParticipant, now: datetime | None = None
    ) -> tuple[bool, str | None, datetime | None]:
        reason = getattr(participant, "ban_reason", None)
        until = getattr(participant, "banned_until", None)
        if not reason:
            return False, None, None
        now = now or datetime.now(timezone.utc)
        if until is not None and until <= now:
            return False, None, None
        return True, reason, until

    @staticmethod
    def ban_message(reason: str | None) -> str:
        label = GROUP_BAN_PRESETS.get(reason or "", (None, reason or ""))[1]
        return f"Вы заблокированы и не можете писать сообщения по причине {label}"

    async def ban_member(self, user: User, dialog_id: uuid.UUID, target_user_id: uuid.UUID, reason: str) -> dict:
        if reason not in GROUP_BAN_PRESETS:
            raise ValueError("invalid_ban_reason")
        actor = await self.messaging._require_participant(dialog_id, user.id)
        if not actor.can_moderate and not actor.is_admin and actor.role != "owner":
            raise ValueError("no_permission")
        target = await self.messaging._get_participant(dialog_id, target_user_id)
        if not target:
            raise ValueError("not_member")
        if target.role == "owner" or target.user_id == user.id:
            raise ValueError("cannot_ban_target")
        if target.is_admin and actor.role != "owner":
            raise ValueError("no_permission")

        hours, _label = GROUP_BAN_PRESETS[reason]
        target.ban_reason = reason
        target.can_post = False
        if hours is None:
            target.banned_until = None
        else:
            target.banned_until = datetime.now(timezone.utc) + timedelta(hours=hours)
        await self.db.commit()
        await ws_manager.publish(
            str(target_user_id),
            {
                "type": "group_ban",
                "data": {
                    "dialog_id": str(dialog_id),
                    "ban_reason": reason,
                    "banned_until": target.banned_until.isoformat() if target.banned_until else None,
                    "message": self.ban_message(reason),
                },
            },
        )
        return {
            "user_id": str(target_user_id),
            "ban_reason": reason,
            "banned_until": target.banned_until.isoformat() if target.banned_until else None,
            "message": self.ban_message(reason),
        }

    async def unban_member(self, user: User, dialog_id: uuid.UUID, target_user_id: uuid.UUID) -> None:
        actor = await self.messaging._require_participant(dialog_id, user.id)
        if not actor.can_moderate and not actor.is_admin and actor.role != "owner":
            raise ValueError("no_permission")
        target = await self.messaging._get_participant(dialog_id, target_user_id)
        if not target:
            raise ValueError("not_member")
        target.ban_reason = None
        target.banned_until = None
        target.can_post = True
        await self.db.commit()
        await ws_manager.publish(
            str(target_user_id),
            {"type": "group_unban", "data": {"dialog_id": str(dialog_id)}},
        )
