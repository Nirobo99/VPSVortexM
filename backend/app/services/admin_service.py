import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import (
    AdminAction,
    AdminLog,
    Announcement,
    Complaint,
    ComplaintStatus,
    ComplaintTargetType,
    PlatformSettings,
)
from app.models.channels import Channel
from app.models.messaging import Message
from app.models.payments import WalletTransaction, TransactionType
from app.models.social import UserIPLog
from app.models.user import User, UserRole
from app.services.channel_service import ChannelService


class AdminService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    async def get_platform_settings(db: AsyncSession) -> PlatformSettings:
        result = await db.execute(select(PlatformSettings).where(PlatformSettings.id == 1))
        row = result.scalar_one_or_none()
        if not row:
            row = PlatformSettings(id=1)
            db.add(row)
            await db.commit()
            await db.refresh(row)
        return row

    async def log(
        self,
        admin: User,
        action: AdminAction,
        ip: str,
        target_type: str | None = None,
        target_id: str | None = None,
        description: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        entry = AdminLog(
            admin_id=admin.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            description=description,
            ip_address=ip,
            metadata_json=metadata,
        )
        self.db.add(entry)

    async def get_stats(self) -> dict:
        users_total = await self.db.scalar(select(func.count()).select_from(User))
        users_active = await self.db.scalar(select(func.count()).select_from(User).where(User.is_active == True))
        users_banned = await self.db.scalar(select(func.count()).select_from(User).where(User.is_banned == True))
        channels_total = await self.db.scalar(select(func.count()).select_from(Channel))
        messages_total = await self.db.scalar(select(func.count()).select_from(Message))
        complaints_pending = await self.db.scalar(
            select(func.count()).select_from(Complaint).where(Complaint.status == ComplaintStatus.PENDING)
        )
        revenue = await self.db.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
                WalletTransaction.transaction_type == TransactionType.TOPUP
            )
        )
        return {
            "users_total": users_total or 0,
            "users_active": users_active or 0,
            "users_banned": users_banned or 0,
            "channels_total": channels_total or 0,
            "messages_total": messages_total or 0,
            "complaints_pending": complaints_pending or 0,
            "revenue_total": int(revenue or 0),
        }

    async def list_users(self, q: str | None = None, page: int = 1, limit: int = 20) -> dict:
        filters = []
        if q:
            like = f"%{q}%"
            filters.append(
                (User.username.ilike(like)) | (User.email.ilike(like)) | (User.display_name.ilike(like))
            )
        count_q = select(func.count(User.id))
        query = select(User).order_by(User.created_at.desc())
        if filters:
            count_q = count_q.where(*filters)
            query = query.where(*filters)
        total = await self.db.scalar(count_q) or 0
        result = await self.db.execute(query.offset((page - 1) * limit).limit(limit))
        users = result.scalars().all()
        return {
            "users": [self._user_item(u) for u in users],
            "total": total,
        }

    def _user_item(self, u: User) -> dict:
        return {
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "display_name": u.display_name,
            "role": u.role.value,
            "is_verified": u.is_verified,
            "is_banned": u.is_banned,
            "is_active": u.is_active,
            "wallet_balance": u.wallet_balance,
            "created_at": u.created_at.isoformat() if u.created_at else "",
        }

    async def get_user(self, user_id: uuid.UUID) -> dict:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("user_not_found")
        logs_result = await self.db.execute(
            select(UserIPLog)
            .where(UserIPLog.user_id == user_id)
            .order_by(UserIPLog.created_at.desc())
            .limit(50)
        )
        ip_logs = [
            {
                "ip_address": log.ip_address,
                "action": log.action,
                "created_at": log.created_at.isoformat() if log.created_at else "",
            }
            for log in logs_result.scalars().all()
        ]
        return {**self._user_item(user), "ip_logs": ip_logs}

    async def ban_user(self, admin: User, user_id: uuid.UUID, ip: str) -> None:
        user = await self._get_user_or_raise(user_id)
        if user.is_superadmin:
            raise ValueError("cannot_modify_superadmin")
        user.is_banned = True
        await self.log(admin, AdminAction.USER_BAN, ip, "user", str(user_id), f"Banned {user.username}")
        await self.db.commit()

    async def unban_user(self, admin: User, user_id: uuid.UUID, ip: str) -> None:
        user = await self._get_user_or_raise(user_id)
        user.is_banned = False
        await self.log(admin, AdminAction.USER_UNBAN, ip, "user", str(user_id), f"Unbanned {user.username}")
        await self.db.commit()

    async def delete_user(self, admin: User, user_id: uuid.UUID, ip: str) -> None:
        user = await self._get_user_or_raise(user_id)
        if user.is_superadmin:
            raise ValueError("cannot_modify_superadmin")
        user.is_active = False
        user.is_banned = True
        user.email = f"deleted_{user.id}@deleted.vortexm"
        await self.log(admin, AdminAction.USER_DELETE, ip, "user", str(user_id), f"Deleted {user.username}")
        await self.db.commit()

    async def update_user(self, admin: User, user_id: uuid.UUID, ip: str, **fields) -> dict:
        user = await self._get_user_or_raise(user_id)
        if user.is_superadmin and admin.id != user.id:
            raise ValueError("cannot_modify_superadmin")

        if "role" in fields and fields["role"] is not None:
            if not admin.is_superadmin:
                raise ValueError("superadmin_required")
            try:
                user.role = UserRole(fields["role"])
            except ValueError:
                raise ValueError("invalid_role")
            await self.log(admin, AdminAction.ROLE_CHANGE, ip, "user", str(user_id), f"Role → {fields['role']}")

        if "is_verified" in fields and fields["is_verified"] is not None:
            user.is_verified = fields["is_verified"]
            await self.log(
                admin, AdminAction.USER_VERIFY, ip, "user", str(user_id),
                f"Verified={fields['is_verified']}",
            )

        if "wallet_balance" in fields and fields["wallet_balance"] is not None:
            if not admin.is_superadmin:
                raise ValueError("superadmin_required")
            user.wallet_balance = fields["wallet_balance"]

        await self.db.commit()
        await self.db.refresh(user)
        return self._user_item(user)

    async def list_logs(self, limit: int = 50) -> list[dict]:
        result = await self.db.execute(
            select(AdminLog, User.username)
            .join(User, User.id == AdminLog.admin_id)
            .order_by(AdminLog.created_at.desc())
            .limit(limit)
        )
        items = []
        for log, username in result.all():
            items.append({
                "id": str(log.id),
                "admin_username": username,
                "action": log.action.value,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "description": log.description,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat() if log.created_at else "",
            })
        return items

    async def create_complaint(self, reporter: User, target_type: str, target_id: str, reason: str) -> dict:
        try:
            tt = ComplaintTargetType(target_type)
        except ValueError:
            raise ValueError("invalid_target_type")
        complaint = Complaint(
            reporter_id=reporter.id,
            target_type=tt,
            target_id=target_id,
            reason=reason,
        )
        self.db.add(complaint)
        await self.db.commit()
        await self.db.refresh(complaint)
        return await self._complaint_dict(complaint)

    async def list_complaints(self, status: str | None = None) -> list[dict]:
        query = select(Complaint).order_by(Complaint.created_at.desc())
        if status:
            try:
                query = query.where(Complaint.status == ComplaintStatus(status))
            except ValueError:
                raise ValueError("invalid_status")
        result = await self.db.execute(query.limit(100))
        complaints = result.scalars().all()
        return [await self._complaint_dict(c) for c in complaints]

    async def resolve_complaint(
        self, admin: User, complaint_id: uuid.UUID, status: str, admin_note: str | None, ip: str
    ) -> dict:
        try:
            new_status = ComplaintStatus(status)
        except ValueError:
            raise ValueError("invalid_status")
        if new_status == ComplaintStatus.PENDING:
            raise ValueError("invalid_status")

        result = await self.db.execute(select(Complaint).where(Complaint.id == complaint_id))
        complaint = result.scalar_one_or_none()
        if not complaint:
            raise ValueError("complaint_not_found")

        complaint.status = new_status
        complaint.admin_note = admin_note
        complaint.resolved_by_id = admin.id
        complaint.resolved_at = datetime.now(timezone.utc)
        await self.log(
            admin, AdminAction.COMPLAINT_RESOLVE, ip, "complaint", str(complaint_id),
            f"Status → {status}",
        )
        await self.db.commit()
        await self.db.refresh(complaint)
        return await self._complaint_dict(complaint)

    async def _complaint_dict(self, c: Complaint) -> dict:
        reporter = await self.db.execute(select(User.username).where(User.id == c.reporter_id))
        username = reporter.scalar_one_or_none() or "?"
        return {
            "id": str(c.id),
            "reporter_username": username,
            "target_type": c.target_type.value,
            "target_id": c.target_id,
            "reason": c.reason,
            "status": c.status.value,
            "admin_note": c.admin_note,
            "created_at": c.created_at.isoformat() if c.created_at else "",
            "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
        }

    async def get_settings(self) -> dict:
        row = await self.get_platform_settings(self.db)
        return {
            "project_enabled": row.project_enabled,
            "registration_enabled": row.registration_enabled,
            "ip_lockout_enabled": row.ip_lockout_enabled,
        }

    async def update_settings(self, admin: User, ip: str, **fields) -> dict:
        if not admin.is_superadmin:
            raise ValueError("superadmin_required")
        row = await self.get_platform_settings(self.db)
        for key in ("project_enabled", "registration_enabled", "ip_lockout_enabled"):
            if key in fields and fields[key] is not None:
                setattr(row, key, fields[key])
        await self.log(admin, AdminAction.SETTINGS_UPDATE, ip, "setting", "1", str(fields))
        await self.db.commit()
        return await self.get_settings()

    async def list_announcements(self) -> list[dict]:
        result = await self.db.execute(select(Announcement).order_by(Announcement.created_at.desc()).limit(50))
        return [self._announcement_dict(a) for a in result.scalars().all()]

    async def create_announcement(self, admin: User, title: str, content: str, is_active: bool, ip: str) -> dict:
        ann = Announcement(title=title, content=content, is_active=is_active, created_by_id=admin.id)
        self.db.add(ann)
        await self.log(admin, AdminAction.ANNOUNCEMENT_CREATE, ip, "announcement", None, title)
        await self.db.commit()
        await self.db.refresh(ann)
        return self._announcement_dict(ann)

    async def delete_announcement(self, admin: User, ann_id: uuid.UUID, ip: str) -> None:
        result = await self.db.execute(select(Announcement).where(Announcement.id == ann_id))
        ann = result.scalar_one_or_none()
        if not ann:
            raise ValueError("announcement_not_found")
        await self.db.delete(ann)
        await self.log(admin, AdminAction.ANNOUNCEMENT_DELETE, ip, "announcement", str(ann_id), ann.title)
        await self.db.commit()

    def _announcement_dict(self, a: Announcement) -> dict:
        return {
            "id": str(a.id),
            "title": a.title,
            "content": a.content,
            "is_active": a.is_active,
            "starts_at": a.starts_at.isoformat() if a.starts_at else None,
            "ends_at": a.ends_at.isoformat() if a.ends_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        }

    async def get_active_announcements(self) -> list[dict]:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(Announcement).where(Announcement.is_active == True).order_by(Announcement.created_at.desc())
        )
        items = []
        for a in result.scalars().all():
            if a.starts_at and a.starts_at > now:
                continue
            if a.ends_at and a.ends_at < now:
                continue
            items.append(self._announcement_dict(a))
        return items

    async def list_channels(self, q: str | None = None) -> list[dict]:
        query = select(Channel).order_by(Channel.created_at.desc()).limit(50)
        if q:
            query = query.where((Channel.title.ilike(f"%{q}%")) | (Channel.slug.ilike(f"%{q}%")))
        result = await self.db.execute(query)
        channels = result.scalars().all()
        items = []
        for ch in channels:
            owner = await self.db.execute(select(User.username).where(User.id == ch.owner_id))
            items.append({
                "id": str(ch.id),
                "slug": ch.slug,
                "title": ch.title,
                "owner_username": owner.scalar_one_or_none() or "?",
                "is_verified": ch.is_verified,
                "subscriber_count": ch.subscriber_count,
            })
        return items

    async def verify_channel(self, admin: User, slug: str, verified: bool, ip: str) -> None:
        await self.log(
            admin, AdminAction.CHANNEL_VERIFY, ip, "channel", slug,
            f"Verified={verified}",
        )
        await self.db.flush()
        service = ChannelService(self.db)
        await service.verify_channel(slug, verified)

    async def _get_user_or_raise(self, user_id: uuid.UUID) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("user_not_found")
        return user
