from app.core.config import get_settings

settings = get_settings()


def build_verification_url(token: str) -> str:
    base = settings.allowed_origins.split(",")[0].strip()
    return f"{base}/verify-email?token={token}"


def build_reset_url(token: str) -> str:
    base = settings.allowed_origins.split(",")[0].strip()
    return f"{base}/reset-password?token={token}"
