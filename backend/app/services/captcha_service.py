import httpx

from app.core.config import get_settings

settings = get_settings()


class CaptchaService:
    @staticmethod
    async def verify(token: str | None, remote_ip: str | None = None) -> bool:
        if not settings.recaptcha_enabled:
            return True
        if not token or not settings.recaptcha_secret_key:
            return False

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                settings.recaptcha_verify_url,
                data={
                    "secret": settings.recaptcha_secret_key,
                    "response": token,
                    "remoteip": remote_ip or "",
                },
            )
        data = response.json()
        return bool(data.get("success")) and float(data.get("score", 1.0)) >= settings.recaptcha_min_score
