import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.i18n import t
from app.core.permissions import SUPERADMIN_USERNAME, ROLE_TEMPLATES
from app.core.security import (
    create_admin_access_token,
    create_admin_refresh_token,
    hash_opaque_token,
    hash_password,
    verify_password,
    verify_totp,
    generate_totp_secret,
    verify_token,
)
from app.core.admin_deps import hash_admin_refresh
from app.core.token_blacklist import revoke_token_jti
from app.models.admin import AdminAccount, AdminRefreshToken
from app.models.user import User, UserRole

settings = get_settings()


class AdminAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def ensure_superadmin_account(self, user: User) -> AdminAccount:
        result = await self.db.execute(select(AdminAccount).where(AdminAccount.user_id == user.id))
        account = result.scalar_one_or_none()
        if account:
            if account.role != "superadmin":
                account.role = "superadmin"
            return account
        account = AdminAccount(
            user_id=user.id,
            role="superadmin",
            is_active=True,
            totp_enabled=False,
        )
        self.db.add(account)
        await self.db.flush()
        return account

    async def login(
        self,
        email: str,
        password: str,
        totp_code: str | None,
        ip: str,
        locale: str = "ru",
    ) -> dict:
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if not user or not verify_password(password, user.password_hash):
            raise ValueError(t("auth.invalid_credentials", locale))

        acc_result = await self.db.execute(select(AdminAccount).where(AdminAccount.user_id == user.id))
        account = acc_result.scalar_one_or_none()

        if user.username == SUPERADMIN_USERNAME:
            account = await self.ensure_superadmin_account(user)
        elif not account or not account.is_active:
            raise ValueError(t("admin_panel.not_admin", locale))

        if account.totp_enabled:
            if not totp_code or not account.totp_secret or not verify_totp(account.totp_secret, totp_code):
                raise ValueError(t("auth.invalid_totp", locale))

        access = create_admin_access_token(str(account.id), str(user.id), account.role)
        refresh, expires = create_admin_refresh_token(str(account.id))
        token_hash = hash_admin_refresh(refresh)
        self.db.add(
            AdminRefreshToken(
                admin_account_id=account.id,
                token_hash=token_hash,
                expires_at=expires,
            )
        )
        await self.db.commit()

        from app.core.permissions import effective_permissions
        perms = effective_permissions(account.role, account.permissions)

        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "admin": {
                "id": str(account.id),
                "user_id": str(user.id),
                "email": user.email,
                "username": user.username,
                "display_name": user.display_name,
                "role": account.role,
                "permissions": perms,
                "totp_enabled": account.totp_enabled,
            },
        }

    async def refresh(self, refresh_token: str, locale: str = "ru") -> dict:
        payload = verify_token(refresh_token, "refresh")
        if not payload or payload.get("scope") != "admin":
            raise ValueError(t("auth.invalid_token", locale))

        token_hash = hash_admin_refresh(refresh_token)
        result = await self.db.execute(
            select(AdminRefreshToken).where(AdminRefreshToken.token_hash == token_hash)
        )
        stored = result.scalar_one_or_none()
        if not stored or stored.expires_at < datetime.now(timezone.utc):
            raise ValueError(t("auth.invalid_token", locale))

        acc_result = await self.db.execute(select(AdminAccount).where(AdminAccount.id == stored.admin_account_id))
        account = acc_result.scalar_one_or_none()
        if not account or not account.is_active:
            raise ValueError(t("admin_panel.inactive", locale))

        user_result = await self.db.execute(select(User).where(User.id == account.user_id))
        user = user_result.scalar_one()

        access = create_admin_access_token(str(account.id), str(user.id), account.role)
        new_refresh, expires = create_admin_refresh_token(str(account.id))
        self.db.add(
            AdminRefreshToken(
                admin_account_id=account.id,
                token_hash=hash_opaque_token(new_refresh),
                expires_at=expires,
            )
        )
        await revoke_token_jti(payload.get("jti"), payload.get("exp"))
        await self.db.delete(stored)
        await self.db.commit()
        return {"access_token": access, "refresh_token": new_refresh, "token_type": "bearer"}

    async def logout(self, refresh_token: str) -> None:
        payload = verify_token(refresh_token, "refresh")
        token_hash = hash_admin_refresh(refresh_token)
        result = await self.db.execute(
            select(AdminRefreshToken).where(AdminRefreshToken.token_hash == token_hash)
        )
        stored = result.scalar_one_or_none()
        if stored:
            if payload:
                await revoke_token_jti(payload.get("jti"), payload.get("exp"))
            await self.db.delete(stored)
            await self.db.commit()

    async def setup_totp(self, account: AdminAccount) -> str:
        secret = generate_totp_secret()
        account.totp_secret = secret
        await self.db.commit()
        return secret

    async def enable_totp(self, account: AdminAccount, code: str, locale: str = "ru") -> None:
        if not account.totp_secret or not verify_totp(account.totp_secret, code):
            raise ValueError(t("auth.invalid_totp", locale))
        account.totp_enabled = True
        await self.db.commit()

    async def create_admin_account(
        self,
        email: str,
        role: str,
        permissions: dict | None,
        password: str | None = None,
        locale: str = "ru",
    ) -> AdminAccount:
        if role not in ROLE_TEMPLATES:
            raise ValueError("invalid_role")
        if role == "superadmin":
            raise ValueError("cannot_create_superadmin")

        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if not user:
            if not password:
                raise ValueError("user_not_found")
            raise ValueError("user_not_found")

        existing = await self.db.execute(select(AdminAccount).where(AdminAccount.user_id == user.id))
        if existing.scalar_one_or_none():
            raise ValueError("admin_exists")

        account = AdminAccount(user_id=user.id, role=role, permissions=permissions, is_active=True)
        self.db.add(account)
        if user.role == UserRole.USER:
            user.role = UserRole.ADMIN
        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def list_admin_accounts(self) -> list[dict]:
        result = await self.db.execute(
            select(AdminAccount, User)
            .join(User, User.id == AdminAccount.user_id)
            .order_by(AdminAccount.created_at.desc())
        )
        items = []
        for acc, user in result.all():
            from app.core.permissions import effective_permissions
            items.append({
                "id": str(acc.id),
                "user_id": str(user.id),
                "email": user.email,
                "username": user.username,
                "display_name": user.display_name,
                "role": acc.role,
                "permissions": effective_permissions(acc.role, acc.permissions),
                "custom_permissions": acc.permissions,
                "is_active": acc.is_active,
                "totp_enabled": acc.totp_enabled,
                "created_at": acc.created_at.isoformat() if acc.created_at else "",
            })
        return items

    async def update_admin_account(
        self,
        account_id: uuid.UUID,
        role: str | None = None,
        permissions: dict | None = None,
        is_active: bool | None = None,
    ) -> AdminAccount:
        result = await self.db.execute(select(AdminAccount, User).join(User).where(AdminAccount.id == account_id))
        row = result.first()
        if not row:
            raise ValueError("admin_not_found")
        account, user = row
        if user.username == SUPERADMIN_USERNAME:
            raise ValueError("cannot_modify_superadmin")
        if role is not None:
            if role == "superadmin":
                raise ValueError("cannot_create_superadmin")
            account.role = role
        if permissions is not None:
            account.permissions = permissions
        if is_active is not None:
            account.is_active = is_active
        await self.db.commit()
        await self.db.refresh(account)
        return account
