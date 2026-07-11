from datetime import datetime, timezone

from app.core.redis_client import get_redis


def _seconds_until(exp: int | float | datetime | None) -> int:
    if exp is None:
        return 0
    if isinstance(exp, datetime):
        delta = exp - datetime.now(timezone.utc)
        return max(0, int(delta.total_seconds()))
    return max(0, int(float(exp) - datetime.now(timezone.utc).timestamp()))


async def revoke_token_jti(jti: str | None, exp: int | float | datetime | None) -> None:
    if not jti:
        return
    ttl = _seconds_until(exp)
    if ttl <= 0:
        return
    redis = await get_redis()
    await redis.setex(f"jwt:blacklist:{jti}", ttl, "1")


async def is_token_revoked(jti: str | None) -> bool:
    if not jti:
        return False
    redis = await get_redis()
    return bool(await redis.exists(f"jwt:blacklist:{jti}"))
