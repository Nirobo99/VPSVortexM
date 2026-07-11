from datetime import datetime, timedelta, timezone
from typing import Any
import hashlib
import secrets

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings
from app.core.crypto import CryptoService
from app.core.csrf import generate_csrf_token

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
settings = get_settings()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "nbf": datetime.now(timezone.utc),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "type": "access",
        "jti": secrets.token_urlsafe(16),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_admin_access_token(admin_account_id: str, user_id: str, role: str) -> str:
    return create_access_token(
        admin_account_id,
        {"scope": "admin", "user_id": user_id, "role": role},
    )


def create_admin_refresh_token(admin_account_id: str) -> tuple[str, datetime]:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    payload = {
        "sub": admin_account_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "nbf": datetime.now(timezone.utc),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "type": "refresh",
        "scope": "admin",
        "jti": secrets.token_urlsafe(16),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, expire


def create_refresh_token(subject: str) -> tuple[str, datetime]:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "nbf": datetime.now(timezone.utc),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, expire


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.jwt_algorithm],
        audience=settings.jwt_audience,
        issuer=settings.jwt_issuer,
    )


def verify_token(token: str, token_type: str = "access") -> dict[str, Any] | None:
    try:
        payload = decode_token(token)
        if payload.get("type") != token_type:
            return None
        return payload
    except JWTError:
        return None


def encrypt_message(plaintext: str) -> bytes:
    return CryptoService().encrypt(plaintext)


def decrypt_message(encrypted: bytes) -> str:
    return CryptoService().decrypt(encrypted)


def hash_opaque_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_totp_secret() -> str:
    import pyotp
    return pyotp.random_base32()


def verify_totp(secret: str, code: str) -> bool:
    import pyotp
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)
