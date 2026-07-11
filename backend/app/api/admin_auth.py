from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_deps import AdminContext, get_current_admin
from app.core.config import get_settings
from app.core.database import get_db
from app.core.i18n import t
from app.core.ip_helper import get_client_ip
from app.core.security import verify_token
from app.core.token_blacklist import revoke_token_jti
from app.schemas.admin_panel import (
    AdminLoginRequest,
    AdminRefreshRequest,
    AdminTokenResponse,
    TotpEnableRequest,
)
from app.services.admin_auth_service import AdminAuthService
from app.services.captcha_service import CaptchaService

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])
settings = get_settings()


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


def _set_admin_cookies(response: Response, access: str, refresh: str) -> None:
    secure = settings.app_env != "development"
    response.set_cookie(
        "admin_access_token", access, httponly=True, secure=secure,
        samesite="strict", max_age=settings.jwt_access_token_expire_minutes * 60,
    )
    response.set_cookie(
        "admin_refresh_token", refresh, httponly=True, secure=secure,
        samesite="strict", max_age=settings.jwt_refresh_token_expire_days * 86400,
    )


def _clear_admin_cookies(response: Response) -> None:
    response.delete_cookie("admin_access_token")
    response.delete_cookie("admin_refresh_token")
    response.delete_cookie(settings.csrf_cookie_name)


@router.post("/login", response_model=AdminTokenResponse)
async def admin_login(
    body: AdminLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    if not await CaptchaService.verify(body.captcha_token, get_client_ip(request)):
        raise HTTPException(status_code=400, detail=t("auth.invalid_captcha", lang))
    service = AdminAuthService(db)
    try:
        data = await service.login(body.email, body.password, body.totp_code, get_client_ip(request), lang)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    _set_admin_cookies(response, data["access_token"], data["refresh_token"])
    return AdminTokenResponse(**data)


@router.post("/refresh", response_model=dict)
async def admin_refresh(
    body: AdminRefreshRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    token = body.refresh_token or request.cookies.get("admin_refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail=t("auth.invalid_token", lang))
    service = AdminAuthService(db)
    try:
        data = await service.refresh(token, lang)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    _set_admin_cookies(response, data["access_token"], data["refresh_token"])
    return data


@router.post("/logout")
async def admin_logout(
    body: AdminRefreshRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    token = body.refresh_token or request.cookies.get("admin_refresh_token")
    if token:
        await AdminAuthService(db).logout(token)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = verify_token(auth[7:], "access")
        if payload:
            await revoke_token_jti(payload.get("jti"), payload.get("exp"))
    _clear_admin_cookies(response)
    return {"message": "ok"}


@router.get("/me")
async def admin_me(admin: AdminContext = Depends(get_current_admin)):
    from app.core.permissions import effective_permissions
    return {
        "id": str(admin.account.id),
        "user_id": str(admin.user.id),
        "email": admin.user.email,
        "username": admin.user.username,
        "display_name": admin.user.display_name,
        "role": admin.account.role,
        "permissions": admin.permissions,
        "totp_enabled": admin.account.totp_enabled,
        "is_superadmin": admin.is_superadmin,
    }


@router.post("/2fa/setup")
async def setup_totp(admin: AdminContext = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    service = AdminAuthService(db)
    secret = await service.setup_totp(admin.account)
    return {"secret": secret, "uri": f"otpauth://totp/VortexM:{admin.user.email}?secret={secret}&issuer=VortexM"}


@router.post("/2fa/enable")
async def enable_totp(
    body: TotpEnableRequest,
    request: Request,
    admin: AdminContext = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        await AdminAuthService(db).enable_totp(admin.account, body.code, lang)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": t("auth.2fa_enabled", lang)}
