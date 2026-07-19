import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.i18n import t
from app.core.rate_limit import RateLimitService
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_csrf_token,
    generate_totp_secret,
    hash_opaque_token,
    hash_password,
    verify_password,
    verify_totp,
    verify_token,
)
from app.core.token_blacklist import revoke_token_jti
from app.models.auth_tokens import EmailVerificationToken, PasswordResetToken, RefreshToken
from app.models.social import UserIPLog
from app.models.user import User, UserRole
from app.services.admin_service import AdminService
from app.tasks.email_tasks import send_password_reset_email, send_verification_email

settings = get_settings()


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(
        self,
        username: str,
        email: str,
        password: str,
        ip: str,
        locale: str = "ru",
        referral_code: str | None = None,
    ) -> User:
        platform = await AdminService.get_platform_settings(self.db)
        if not platform.registration_enabled:
            raise ValueError(t("auth.registration_disabled", locale))

        if platform.ip_lockout_enabled:
            allowed, ttl = await RateLimitService.check_registration_lock(ip, email)
            if not allowed:
                raise ValueError(t("auth.registration_locked", locale, hours=settings.registration_lockout_hours))

        existing = await self.db.execute(
            select(User).where((User.email == email.lower()) | (User.username == username))
        )
        if existing.scalar_one_or_none():
            raise ValueError(t("auth.user_exists", locale))

        referred_by_id = None
        if referral_code:
            from app.services.referral_service import ReferralService

            ref_svc = ReferralService(self.db)
            referrer = await ref_svc.get_by_code(referral_code)
            if referrer and not referrer.is_banned:
                referred_by_id = referrer.id

        from app.services.referral_service import ReferralService

        user = User(
            username=username,
            email=email.lower(),
            password_hash=hash_password(password),
            is_active=False,
            is_verified=False,
            locale=locale,
            referral_code=await ReferralService(self.db).ensure_unique_code(),
            referred_by_id=referred_by_id,
        )
        self.db.add(user)
        await self.db.flush()

        verify_token = secrets.token_urlsafe(32)
        token_record = EmailVerificationToken(
            user_id=user.id,
            token=verify_token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        self.db.add(token_record)
        await self._log_ip(user.id, ip, "registration")
        await self.db.commit()

        send_verification_email.delay(str(user.id), verify_token, locale)
        return user

    async def verify_email(self, token: str, locale: str = "ru") -> User:
        result = await self.db.execute(
            select(EmailVerificationToken).where(EmailVerificationToken.token == token)
        )
        record = result.scalar_one_or_none()
        if not record or record.expires_at < datetime.now(timezone.utc):
            raise ValueError(t("auth.invalid_verification_token", locale))

        user_result = await self.db.execute(select(User).where(User.id == record.user_id))
        user = user_result.scalar_one()
        user.is_active = True
        user.is_verified = True
        await self.db.delete(record)
        await self.db.commit()
        try:
            from app.services.sticker_service import StickerService

            await StickerService(self.db).grant_official_free_packs(user)
        except Exception:
            pass
        return user

    async def login(
        self,
        email: str,
        password: str,
        ip: str,
        totp_code: str | None = None,
        locale: str = "ru",
    ) -> tuple[str, str, str, User]:
        platform = await AdminService.get_platform_settings(self.db)
        if platform.ip_lockout_enabled:
            allowed, ttl = await RateLimitService.check_login_attempts(ip, email)
            if not allowed:
                raise ValueError(t("auth.login_locked", locale, minutes=ttl // 60 + 1))

        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.password_hash):
            if user:
                await RateLimitService.record_login_failure(ip, email)
            await self._log_ip(user.id if user else None, ip, "login_failed")
            raise ValueError(t("auth.invalid_credentials", locale))

        if not user.is_active:
            raise ValueError(t("auth.email_not_verified", locale))

        if user.is_banned:
            raise ValueError(t("auth.user_banned", locale))

        if user.totp_enabled:
            if not totp_code or not verify_totp(user.totp_secret, totp_code):
                await RateLimitService.record_login_failure(ip, email)
                raise ValueError(t("auth.invalid_totp", locale))

        await RateLimitService.clear_login_attempts(ip, email)
        await self._log_ip(user.id, ip, "login")

        access = create_access_token(str(user.id), {"role": user.role.value})
        refresh, expires = create_refresh_token(str(user.id))

        refresh_record = RefreshToken(
            user_id=user.id,
            token_hash=hash_opaque_token(refresh),
            expires_at=expires,
        )
        self.db.add(refresh_record)
        await self.db.commit()

        csrf = generate_csrf_token()
        session_id = str(user.id)
        await RateLimitService.store_csrf(session_id, csrf)

        return access, refresh, csrf, user

    async def refresh_tokens(self, refresh_token: str, locale: str = "ru") -> tuple[str, str, str]:
        payload = verify_token(refresh_token, "refresh")
        if not payload:
            raise ValueError(t("auth.invalid_token", locale))

        token_hash = hash_opaque_token(refresh_token)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,
            )
        )
        record = result.scalar_one_or_none()
        if not record or record.expires_at < datetime.now(timezone.utc):
            raise ValueError(t("auth.invalid_token", locale))

        user_result = await self.db.execute(select(User).where(User.id == record.user_id))
        user = user_result.scalar_one()

        record.revoked = True
        await revoke_token_jti(payload.get("jti"), payload.get("exp"))
        access = create_access_token(str(user.id), {"role": user.role.value})
        new_refresh, expires = create_refresh_token(str(user.id))
        new_record = RefreshToken(
            user_id=user.id,
            token_hash=hash_opaque_token(new_refresh),
            expires_at=expires,
        )
        self.db.add(new_record)
        await self.db.commit()

        csrf = generate_csrf_token()
        await RateLimitService.store_csrf(str(user.id), csrf)
        return access, new_refresh, csrf

    async def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        payload = verify_token(refresh_token, "refresh")
        token_hash = hash_opaque_token(refresh_token)
        result = await self.db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        record = result.scalar_one_or_none()
        if record:
            record.revoked = True
            if payload:
                await revoke_token_jti(payload.get("jti"), payload.get("exp"))
            await self.db.commit()

    async def request_password_reset(self, email: str, locale: str = "ru") -> None:
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if not user:
            return

        token = secrets.token_urlsafe(32)
        reset_record = PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        self.db.add(reset_record)
        await self.db.commit()
        send_password_reset_email.delay(str(user.id), token, locale)

    async def reset_password(self, token: str, new_password: str, locale: str = "ru") -> None:
        result = await self.db.execute(select(PasswordResetToken).where(PasswordResetToken.token == token))
        record = result.scalar_one_or_none()
        if not record or record.used or record.expires_at < datetime.now(timezone.utc):
            raise ValueError(t("auth.invalid_reset_token", locale))

        user_result = await self.db.execute(select(User).where(User.id == record.user_id))
        user = user_result.scalar_one()
        user.password_hash = hash_password(new_password)
        record.used = True
        await self.db.commit()

    async def setup_2fa(self, user: User) -> str:
        secret = generate_totp_secret()
        user.totp_secret = secret
        await self.db.commit()
        return secret

    async def enable_2fa(self, user: User, code: str, locale: str = "ru") -> None:
        if not user.totp_secret or not verify_totp(user.totp_secret, code):
            raise ValueError(t("auth.invalid_totp", locale))
        user.totp_enabled = True
        await self.db.commit()

    async def disable_2fa(self, user: User, code: str, locale: str = "ru") -> None:
        if not verify_totp(user.totp_secret, code):
            raise ValueError(t("auth.invalid_totp", locale))
        user.totp_enabled = False
        user.totp_secret = None
        await self.db.commit()

    async def change_password(self, user: User, current_password: str, new_password: str, locale: str = "ru") -> None:
        if not verify_password(current_password, user.password_hash):
            raise ValueError(t("auth.invalid_credentials", locale))
        if len(new_password) < 8:
            raise ValueError("Password too short")
        user.password_hash = hash_password(new_password)
        await self.db.commit()

    async def _log_ip(self, user_id: uuid.UUID | None, ip: str, action: str) -> None:
        log = UserIPLog(user_id=user_id, ip_address=ip, action=action)
        self.db.add(log)

    @staticmethod
    async def create_superadmin(db: AsyncSession) -> User | None:
        result = await db.execute(select(User).where(User.username == settings.superadmin_username))
        if result.scalar_one_or_none():
            return None

        user = User(
            username=settings.superadmin_username,
            email=settings.superadmin_email,
            password_hash=hash_password(settings.superadmin_password),
            display_name="Моргенштерн@",
            is_active=True,
            is_verified=True,
            role=UserRole.SUPERADMIN,
            locale="ru",
            referral_code=secrets.token_urlsafe(8)[:12],
        )
        db.add(user)
        await db.commit()
        return user
