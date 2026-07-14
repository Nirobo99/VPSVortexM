from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import get_redis
from app.models.user import User
from app.services.ws_manager import ws_manager

PRESENCE_PREFIX = "presence"
PRESENCE_TTL = 90


class PresenceService:
    @staticmethod
    def _key(user_id: str) -> str:
        return f"{PRESENCE_PREFIX}:{user_id}"

    @staticmethod
    async def set_online(user_id: str) -> None:
        redis = await get_redis()
        await redis.setex(PresenceService._key(user_id), PRESENCE_TTL, "1")

    @staticmethod
    async def refresh(user_id: str) -> None:
        await PresenceService.set_online(user_id)

    @staticmethod
    async def is_online(user_id: str) -> bool:
        redis = await get_redis()
        return bool(await redis.exists(PresenceService._key(user_id)))

    @staticmethod
    def display_last_seen(user: User, *, viewer_is_self: bool = False) -> dict:
        now = datetime.now(timezone.utc)
        invisible_active = user.invisible_until and user.invisible_until > now
        if invisible_active and not viewer_is_self:
            fake = user.invisible_fake_last_seen or user.last_seen_at
            return {
                "is_online": False,
                "last_seen_at": fake.isoformat() if fake else None,
                "invisible_mode": True,
            }
        return {
            "is_online": False,
            "last_seen_at": user.last_seen_at.isoformat() if user.last_seen_at else None,
            "invisible_mode": invisible_active,
        }

    @staticmethod
    async def get_status(db: AsyncSession, user_id: str, viewer_id: str | None = None) -> dict:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return {"is_online": False, "last_seen_at": None, "invisible_mode": False}
        viewer_is_self = viewer_id is not None and str(user.id) == viewer_id
        online = await PresenceService.is_online(str(user.id))
        now = datetime.now(timezone.utc)
        invisible_active = user.invisible_until and user.invisible_until > now
        if invisible_active and not viewer_is_self:
            fake = user.invisible_fake_last_seen or user.last_seen_at
            return {
                "is_online": False,
                "last_seen_at": fake.isoformat() if fake else None,
                "invisible_mode": True,
            }
        return {
            "is_online": online,
            "last_seen_at": user.last_seen_at.isoformat() if user.last_seen_at else None,
            "invisible_mode": invisible_active and viewer_is_self,
        }

    @staticmethod
    async def set_offline(db: AsyncSession, user: User) -> None:
        redis = await get_redis()
        await redis.delete(PresenceService._key(str(user.id)))
        user.last_seen_at = datetime.now(timezone.utc)
        await db.commit()

    @staticmethod
    async def broadcast_presence(user_id: str, contact_ids: list[str], status: dict) -> None:
        event = {"type": "presence_update", "user_id": user_id, "data": status}
        await ws_manager.publish_many(contact_ids, event)
