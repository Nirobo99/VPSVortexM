from datetime import datetime, timezone
import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.i18n import t
from app.core.security import verify_token
from app.core.token_blacklist import is_token_revoked
from app.models.user import User, UserRole

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    lang = request.headers.get("Accept-Language", "ru")[:2]
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=t("auth.unauthorized", lang))
    payload = verify_token(credentials.credentials, "access")
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=t("auth.invalid_token", lang))
    if await is_token_revoked(payload.get("jti")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=t("auth.invalid_token", lang))
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=t("auth.user_inactive", lang))
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("auth.user_banned", lang))
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    payload = verify_token(credentials.credentials, "access")
    if not payload:
        return None
    if await is_token_revoked(payload.get("jti")):
        return None
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    return result.scalar_one_or_none()


async def get_superadmin(
    request: Request,
    user: User = Depends(get_current_user),
) -> User:
    lang = request.headers.get("Accept-Language", "ru")[:2]
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("auth.superadmin_required", lang))
    return user


async def get_admin(
    request: Request,
    user: User = Depends(get_current_user),
) -> User:
    lang = request.headers.get("Accept-Language", "ru")[:2]
    if user.role not in (UserRole.ADMIN, UserRole.SUPERADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=t("auth.admin_required", lang))
    return user
