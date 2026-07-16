import csv
import io
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_deps import AdminContext
from app.core.html_sanitizer import sanitize_html
from app.core.permissions import SUPERADMIN_USERNAME
from app.models.admin import (
    AdBanner,
    AdminAction,
    AdminLog,
    BackupRecord,
    Broadcast,
    Complaint,
    ComplaintStatus,
    PlatformSettings,
    StaticPage,
)
from app.models.channels import Channel
from app.models.messaging import Dialog, DialogType, Message
from app.models.payments import WalletPayment, WalletTransaction, TransactionType
from app.models.user import User
from app.services.admin_service import AdminService


class AdminPanelService(AdminService):
    async def log_ctx(
        self,
        ctx: AdminContext,
        action: AdminAction,
        ip: str,
        user_agent: str | None = None,
        target_type: str | None = None,
        target_id: str | None = None,
        description: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        entry = AdminLog(
            admin_id=ctx.user.id,
            admin_account_id=ctx.account.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            description=description,
            ip_address=ip,
            user_agent=user_agent,
            metadata_json=metadata,
        )
        self.db.add(entry)

    async def get_dashboard(self) -> dict:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)

        users_total = await self.db.scalar(select(func.count()).select_from(User)) or 0
        users_today = await self.db.scalar(
            select(func.count()).select_from(User).where(User.created_at >= today_start)
        ) or 0
        users_week = await self.db.scalar(
            select(func.count()).select_from(User).where(User.created_at >= week_start)
        ) or 0
        active_today = await self.db.scalar(
            select(func.count(func.distinct(Message.sender_id))).where(Message.created_at >= today_start)
        ) or 0

        revenue_today = await self.db.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
                WalletTransaction.transaction_type == TransactionType.TOPUP.value,
                WalletTransaction.created_at >= today_start,
            )
        ) or 0
        revenue_week = await self.db.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
                WalletTransaction.transaction_type == TransactionType.TOPUP.value,
                WalletTransaction.created_at >= week_start,
            )
        ) or 0
        revenue_total = await self.db.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
                WalletTransaction.transaction_type == TransactionType.TOPUP.value,
            )
        ) or 0

        complaints_new = await self.db.scalar(
            select(func.count()).select_from(Complaint).where(Complaint.status == ComplaintStatus.PENDING)
        ) or 0
        complaints_total = await self.db.scalar(select(func.count()).select_from(Complaint)) or 0

        activity = []
        for i in range(6, -1, -1):
            day = today_start - timedelta(days=i)
            next_day = day + timedelta(days=1)
            msg_count = await self.db.scalar(
                select(func.count()).select_from(Message).where(
                    Message.created_at >= day, Message.created_at < next_day
                )
            ) or 0
            activity.append({"date": day.date().isoformat(), "messages": msg_count})

        return {
            "users_total": users_total,
            "users_active_today": active_today,
            "users_new_week": users_week,
            "users_new_today": users_today,
            "revenue_today": int(revenue_today),
            "revenue_week": int(revenue_week),
            "revenue_total": int(revenue_total),
            "complaints_new": complaints_new,
            "complaints_total": complaints_total,
            "channels_total": await self.db.scalar(select(func.count()).select_from(Channel)) or 0,
            "messages_total": await self.db.scalar(select(func.count()).select_from(Message)) or 0,
            "activity_chart": activity,
        }

    async def list_users_filtered(
        self,
        q: str | None = None,
        verified: bool | None = None,
        banned: bool | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        filters = []
        if q:
            like = f"%{q}%"
            filters.append(
                (User.username.ilike(like)) | (User.email.ilike(like)) | (User.display_name.ilike(like))
            )
        if verified is not None:
            filters.append(User.is_verified == verified)
        if banned is not None:
            filters.append(User.is_banned == banned)
        count_q = select(func.count(User.id))
        query = select(User).order_by(User.created_at.desc())
        if filters:
            count_q = count_q.where(*filters)
            query = query.where(*filters)
        total = await self.db.scalar(count_q) or 0
        result = await self.db.execute(query.offset((page - 1) * limit).limit(limit))
        return {"users": [self._user_item(u) for u in result.scalars().all()], "total": total}

    async def get_user_full(self, user_id: uuid.UUID) -> dict:
        data = await self.get_user(user_id)
        tx_result = await self.db.execute(
            select(WalletTransaction)
            .where(WalletTransaction.user_id == user_id)
            .order_by(WalletTransaction.created_at.desc())
            .limit(20)
        )
        pay_result = await self.db.execute(
            select(WalletPayment)
            .where(WalletPayment.user_id == user_id)
            .order_by(WalletPayment.created_at.desc())
            .limit(20)
        )
        data["transactions"] = [
            {
                "id": str(t.id),
                "amount": t.amount,
                "type": t.transaction_type.value if hasattr(t.transaction_type, "value") else str(t.transaction_type),
                "balance_after": t.balance_after,
                "created_at": t.created_at.isoformat() if t.created_at else "",
            }
            for t in tx_result.scalars().all()
        ]
        data["payments"] = [
            {
                "id": str(p.id),
                "amount": p.amount,
                "status": p.status.value,
                "created_at": p.created_at.isoformat() if p.created_at else "",
            }
            for p in pay_result.scalars().all()
        ]
        return data

    async def export_users_csv(self, user_ids: list[uuid.UUID] | None = None) -> str:
        query = select(User).order_by(User.created_at.desc())
        if user_ids:
            query = query.where(User.id.in_(user_ids))
        result = await self.db.execute(query.limit(5000))
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "username", "email", "verified", "banned", "balance", "created_at"])
        for u in result.scalars().all():
            writer.writerow([
                str(u.id), u.username, u.email, u.is_verified, u.is_banned,
                u.wallet_balance, u.created_at.isoformat() if u.created_at else "",
            ])
        return output.getvalue()

    async def bulk_ban(self, ctx: AdminContext, user_ids: list[uuid.UUID], ip: str) -> int:
        count = 0
        for uid in user_ids:
            result = await self.db.execute(select(User).where(User.id == uid))
            user = result.scalar_one_or_none()
            if user and user.username != SUPERADMIN_USERNAME:
                user.is_banned = True
                count += 1
        await self.log_ctx(ctx, AdminAction.USER_BAN, ip, "user", "bulk", f"Banned {count} users")
        await self.db.commit()
        return count

    async def list_groups(self, q: str | None = None) -> list[dict]:
        query = select(Dialog).where(Dialog.dialog_type == DialogType.GROUP).order_by(Dialog.created_at.desc())
        if q:
            query = query.where(Dialog.title.ilike(f"%{q}%"))
        result = await self.db.execute(query.limit(100))
        items = []
        for d in result.scalars().all():
            mc = await self.db.scalar(
                select(func.count()).select_from(
                    select(Dialog).where(Dialog.id == d.id).subquery()
                )
            )
            items.append({
                "id": str(d.id),
                "title": d.title,
                "owner_id": str(d.owner_id) if d.owner_id else None,
                "member_limit": d.member_limit,
                "is_frozen": not d.is_paid_extended if hasattr(d, "is_paid_extended") else False,
                "created_at": d.created_at.isoformat() if d.created_at else "",
            })
        return items

    async def delete_channel(self, ctx: AdminContext, slug: str, ip: str) -> None:
        result = await self.db.execute(select(Channel).where(Channel.slug == slug))
        ch = result.scalar_one_or_none()
        if not ch:
            raise ValueError("channel_not_found")
        await self.db.delete(ch)
        await self.log_ctx(ctx, AdminAction.CHANNEL_VERIFY, ip, "channel", slug, "Deleted channel")
        await self.db.commit()

    async def assign_complaint(self, complaint_id: uuid.UUID, admin_user_id: uuid.UUID) -> dict:
        result = await self.db.execute(select(Complaint).where(Complaint.id == complaint_id))
        c = result.scalar_one_or_none()
        if not c:
            raise ValueError("complaint_not_found")
        c.status = ComplaintStatus.IN_PROGRESS
        c.assigned_to_id = admin_user_id
        await self.db.commit()
        return await self._complaint_dict(c)

    async def list_finance(
        self,
        user_id: uuid.UUID | None = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        query = select(WalletTransaction).order_by(WalletTransaction.created_at.desc())
        if user_id:
            query = query.where(WalletTransaction.user_id == user_id)
        total = await self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        result = await self.db.execute(query.offset((page - 1) * limit).limit(limit))
        items = []
        for t in result.scalars().all():
            user = await self.db.execute(select(User.username).where(User.id == t.user_id))
            items.append({
                "id": str(t.id),
                "user_id": str(t.user_id),
                "username": user.scalar_one_or_none(),
                "amount": t.amount,
                "type": t.transaction_type.value if hasattr(t.transaction_type, "value") else str(t.transaction_type),
                "balance_after": t.balance_after,
                "description": t.description,
                "created_at": t.created_at.isoformat() if t.created_at else "",
            })
        return {"transactions": items, "total": total}

    async def adjust_wallet(
        self, ctx: AdminContext, user_id: uuid.UUID, amount: int, reason: str, ip: str
    ) -> dict:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("user_not_found")
        user.wallet_balance += amount
        txn = WalletTransaction(
            user_id=user.id,
            amount=amount,
            balance_after=user.wallet_balance,
            transaction_type=TransactionType.TOPUP.value if amount > 0 else TransactionType.SPEND.value,
            description=f"Admin adjust: {reason}",
        )
        self.db.add(txn)
        await self.log_ctx(ctx, AdminAction.FINANCE_ADJUST, ip, "user", str(user_id), reason, {"amount": amount})
        await self.db.commit()
        return {"balance": user.wallet_balance}

    # Ads
    async def list_ads(self) -> list[dict]:
        result = await self.db.execute(select(AdBanner).order_by(AdBanner.created_at.desc()))
        return [self._ad_dict(a) for a in result.scalars().all()]

    def _ad_dict(self, a: AdBanner) -> dict:
        ctr = (a.clicks / a.impressions * 100) if a.impressions else 0
        return {
            "id": str(a.id),
            "title": a.title,
            "image_url": a.image_url,
            "link_url": a.link_url,
            "target_locale": a.target_locale,
            "target_region": a.target_region,
            "impressions": a.impressions,
            "clicks": a.clicks,
            "ctr": round(ctr, 2),
            "is_active": a.is_active,
            "starts_at": a.starts_at.isoformat() if a.starts_at else None,
            "ends_at": a.ends_at.isoformat() if a.ends_at else None,
        }

    async def create_ad(self, ctx: AdminContext, data: dict, ip: str) -> dict:
        ad = AdBanner(created_by_id=ctx.user.id, **data)
        self.db.add(ad)
        await self.log_ctx(ctx, AdminAction.AD_MANAGE, ip, "ad", None, data.get("title"))
        await self.db.commit()
        await self.db.refresh(ad)
        return self._ad_dict(ad)

    async def delete_ad(self, ctx: AdminContext, ad_id: uuid.UUID, ip: str) -> None:
        result = await self.db.execute(select(AdBanner).where(AdBanner.id == ad_id))
        ad = result.scalar_one_or_none()
        if ad:
            await self.db.delete(ad)
            await self.log_ctx(ctx, AdminAction.AD_MANAGE, ip, "ad", str(ad_id), "deleted")
            await self.db.commit()

    # Broadcasts
    async def list_broadcasts(self) -> list[dict]:
        result = await self.db.execute(select(Broadcast).order_by(Broadcast.created_at.desc()))
        return [self._broadcast_dict(b) for b in result.scalars().all()]

    def _broadcast_dict(self, b: Broadcast) -> dict:
        return {
            "id": str(b.id),
            "broadcast_type": b.broadcast_type,
            "subject": b.subject,
            "internal_text": b.internal_text,
            "status": b.status,
            "sent_count": b.sent_count,
            "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
            "sent_at": b.sent_at.isoformat() if b.sent_at else None,
            "created_at": b.created_at.isoformat() if b.created_at else "",
        }

    async def create_broadcast(self, ctx: AdminContext, data: dict, ip: str) -> dict:
        if "body_html" in data:
            data["body_html"] = sanitize_html(data.get("body_html"))
        b = Broadcast(created_by_id=ctx.user.id, **data)
        self.db.add(b)
        await self.db.commit()
        await self.db.refresh(b)
        return self._broadcast_dict(b)

    async def send_broadcast(self, ctx: AdminContext, broadcast_id: uuid.UUID, ip: str) -> dict:
        result = await self.db.execute(select(Broadcast).where(Broadcast.id == broadcast_id))
        b = result.scalar_one_or_none()
        if not b:
            raise ValueError("not_found")
        user_count = await self.db.scalar(select(func.count()).select_from(User).where(User.is_active == True)) or 0
        b.status = "sent"
        b.sent_at = datetime.now(timezone.utc)
        b.sent_count = user_count
        await self.log_ctx(ctx, AdminAction.BROADCAST_SEND, ip, "broadcast", str(broadcast_id))
        await self.db.commit()
        return self._broadcast_dict(b)

    # Static pages
    async def list_pages(self) -> list[dict]:
        result = await self.db.execute(select(StaticPage).order_by(StaticPage.slug))
        return [self._page_dict(p) for p in result.scalars().all()]

    def _page_dict(self, p: StaticPage) -> dict:
        return {
            "id": str(p.id),
            "slug": p.slug,
            "title": p.title,
            "content_html": p.content_html,
            "updated_at": p.updated_at.isoformat() if p.updated_at else "",
        }

    async def update_page(self, ctx: AdminContext, slug: str, title: str, content_html: str, ip: str) -> dict:
        content_html = sanitize_html(content_html) or ""
        result = await self.db.execute(select(StaticPage).where(StaticPage.slug == slug))
        p = result.scalar_one_or_none()
        if not p:
            p = StaticPage(slug=slug, title=title, content_html=content_html, updated_by_id=ctx.user.id)
            self.db.add(p)
        else:
            p.title = title
            p.content_html = content_html
            p.updated_by_id = ctx.user.id
        await self.log_ctx(ctx, AdminAction.PAGE_EDIT, ip, "page", slug)
        await self.db.commit()
        await self.db.refresh(p)
        return self._page_dict(p)

    async def get_settings_full(self) -> dict:
        row = await self.get_platform_settings(self.db)
        return {
            "project_enabled": row.project_enabled,
            "registration_enabled": row.registration_enabled,
            "ip_lockout_enabled": row.ip_lockout_enabled,
            "project_name": row.project_name,
            "logo_url": row.logo_url,
            "favicon_url": row.favicon_url,
            "prices": row.prices or {
                "group_extension": 500,
                "premium_monthly": 299,
                "invisible_monthly": 199,
            },
            "allowed_admin_ips": row.allowed_admin_ips or [],
            "backup_schedule_cron": row.backup_schedule_cron,
        }

    async def update_settings_full(self, ctx: AdminContext, ip: str, **fields) -> dict:
        row = await self.get_platform_settings(self.db)
        for key, val in fields.items():
            if val is not None and hasattr(row, key):
                setattr(row, key, val)
        await self.log_ctx(ctx, AdminAction.SETTINGS_UPDATE, ip, "settings", "1", str(fields))
        await self.db.commit()
        return await self.get_settings_full()

    # Backups
    async def list_backups(self) -> list[dict]:
        result = await self.db.execute(select(BackupRecord).order_by(BackupRecord.created_at.desc()))
        return [
            {
                "id": str(b.id),
                "filename": b.filename,
                "file_size": b.file_size,
                "status": b.status,
                "created_at": b.created_at.isoformat() if b.created_at else "",
            }
            for b in result.scalars().all()
        ]

    async def create_backup(self, ctx: AdminContext, ip: str) -> dict:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        record = BackupRecord(
            filename=f"vortexm_backup_{ts}.sql.gz",
            file_size=0,
            storage_path=f"/backups/vortexm_backup_{ts}.sql.gz",
            status="completed",
            created_by_id=ctx.user.id,
        )
        self.db.add(record)
        await self.log_ctx(ctx, AdminAction.BACKUP_CREATE, ip, "backup", None, record.filename)
        await self.db.commit()
        await self.db.refresh(record)
        return {"id": str(record.id), "filename": record.filename, "status": record.status}
