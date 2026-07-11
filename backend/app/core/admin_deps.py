import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.i18n import t
from app.core.permissions import SUPERADMIN_USERNAME, effective_permissions, has_permission
from app.core.security import verify_token
from app.core.token_blacklist import is_token_revoked
from app.models.admin import AdminAccount
from app.models.user import User

admin_security = HTTPBearer(auto_error=False)


class AdminContext:
    def __init__(self, account: AdminAccount, user: User, permissions: list[str]):
        self.account = account
        self.user = user
        self.permissions = permissions

    @property
    def is_superadmin(self) -> bool:
        return self.account.role == "superadmin" or self.user.username == SUPERADMIN_USERNAME

    def can(self, resource: str, action: str) -> bool:
        return has_permission(self.permissions, resource, action)


async def get_admin_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(admin_security),
) -> str | None:
    if credentials:
        return credentials.credentials
    cookie = request.cookies.get("admin_access_token")
    return cookie


async def get_current_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(get_admin_token),
) -> AdminContext:
    lang = request.headers.get("Accept-Language", "ru")[:2]
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=t("admin_panel.unauthorized", lang))

    payload = verify_token(token, "access")
    if not payload or payload.get("scope") != "admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=t("admin_panel.invalid_token", lang))
    if await is_token_revoked(payload.get("jti")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=t("admin_panel.invalid_token", lang))

    account_id = payload.get("sub")
    import uuid as _uuid
    result = await db.execute(select(AdminAccount).where(AdminAccount.id == _uuid.UUID(account_id)))
    account = result.scalar_one_or_none()
    if not account or not account.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=t("admin_panel.inactive", lang))

    user_result = await db.execute(select(User).where(User.id == account.user_id))
    user = user_result.scalar_one_or_none()
    if not user or user.is_banned or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("admin_panel.inactive", lang))

    # IP allowlist
    settings_row = await _get_settings(db)
    allowed_ips = settings_row.allowed_admin_ips if settings_row else None
    if allowed_ips:
        from app.core.ip_helper import get_client_ip
        client_ip = get_client_ip(request)
        if client_ip not in allowed_ips and client_ip != "unknown":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("admin_panel.ip_denied", lang))

    if settings.admin_secret_header_value:
        header_value = request.headers.get(settings.security_header_name)
        if header_value != settings.admin_secret_header_value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("admin_panel.forbidden", lang))

    perms = effective_permissions(account.role, account.permissions)
    return AdminContext(account, user, perms)


async def _get_settings(db: AsyncSession):
    from app.models.admin import PlatformSettings
    result = await db.execute(select(PlatformSettings).where(PlatformSettings.id == 1))
    return result.scalar_one_or_none()


def require_permission(resource: str, action: str):
    async def _checker(
        request: Request,
        admin: AdminContext = Depends(get_current_admin),
    ) -> AdminContext:
        lang = request.headers.get("Accept-Language", "ru")[:2]
        if not admin.can(resource, action):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("admin_panel.forbidden", lang))
        return admin

    return _checker


def hash_admin_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
