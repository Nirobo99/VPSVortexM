from app.core.config import get_settings
from app.core.redis_client import get_redis

settings = get_settings()


class RateLimitService:
    @staticmethod
    async def increment_window(key: str, ttl_seconds: int) -> int:
        redis = await get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, ttl_seconds)
        return count

    @staticmethod
    async def csrf_session_key(session_id: str) -> str:
        return f"csrf:{session_id}"

    @staticmethod
    async def check_login_attempts(ip: str, email: str) -> tuple[bool, int]:
        redis = await get_redis()
        key = f"login_attempts:{ip}:{email.lower()}"
        attempts = await redis.get(key)
        count = int(attempts) if attempts else 0
        if count >= settings.login_max_attempts:
            ttl = await redis.ttl(key)
            return False, ttl
        return True, 0

    @staticmethod
    async def record_login_failure(ip: str, email: str) -> int:
        redis = await get_redis()
        key = f"login_attempts:{ip}:{email.lower()}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, settings.login_lockout_minutes * 60)
        return count

    @staticmethod
    async def clear_login_attempts(ip: str, email: str) -> None:
        redis = await get_redis()
        await redis.delete(f"login_attempts:{ip}:{email.lower()}")

    @staticmethod
    async def check_registration_lock(ip: str, email: str) -> tuple[bool, int]:
        redis = await get_redis()
        ip_key = f"reg_lock:ip:{ip}"
        email_key = f"reg_lock:email:{email.lower()}"
        for key in (ip_key, email_key):
            if await redis.exists(key):
                ttl = await redis.ttl(key)
                return False, ttl
        return True, 0

    @staticmethod
    async def lock_registration(ip: str, email: str) -> None:
        redis = await get_redis()
        ttl = settings.registration_lockout_hours * 3600
        await redis.setex(f"reg_lock:ip:{ip}", ttl, "1")
        await redis.setex(f"reg_lock:email:{email.lower()}", ttl, "1")

    @staticmethod
    async def store_csrf(session_id: str, token: str, ttl: int = 3600) -> None:
        redis = await get_redis()
        await redis.setex(f"csrf:{session_id}", ttl, token)

    @staticmethod
    async def verify_csrf(session_id: str, token: str) -> bool:
        redis = await get_redis()
        stored = await redis.get(f"csrf:{session_id}")
        return stored == token if stored else False

    @staticmethod
    async def track_websocket_connection(user_id: str, limit: int) -> tuple[bool, int]:
        redis = await get_redis()
        key = f"ws:connections:{user_id}"
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, 3600)
        return current <= limit, current

    @staticmethod
    async def release_websocket_connection(user_id: str) -> None:
        redis = await get_redis()
        key = f"ws:connections:{user_id}"
        current = await redis.decr(key)
        if current <= 0:
            await redis.delete(key)
