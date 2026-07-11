from app.core.redis_client import get_redis

UNREAD_PREFIX = "unread"
DELIVERED_PREFIX = "delivered"


class UnreadService:
    @staticmethod
    def _key(user_id: str, dialog_id: str) -> str:
        return f"{UNREAD_PREFIX}:{user_id}:{dialog_id}"

    @staticmethod
    async def increment(user_id: str, dialog_id: str) -> int:
        redis = await get_redis()
        return await redis.incr(UnreadService._key(user_id, dialog_id))

    @staticmethod
    async def reset(user_id: str, dialog_id: str) -> None:
        redis = await get_redis()
        await redis.delete(UnreadService._key(user_id, dialog_id))

    @staticmethod
    async def get(user_id: str, dialog_id: str) -> int:
        redis = await get_redis()
        val = await redis.get(UnreadService._key(user_id, dialog_id))
        return int(val) if val else 0

    @staticmethod
    async def get_total(user_id: str, dialog_ids: list[str]) -> int:
        if not dialog_ids:
            return 0
        redis = await get_redis()
        keys = [UnreadService._key(user_id, d) for d in dialog_ids]
        values = await redis.mget(keys)
        return sum(int(v) for v in values if v)
