from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.i18n import t
from app.core.ip_helper import get_client_ip
from app.core.security import verify_token
from app.core.token_blacklist import revoke_token_jti
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    Enable2FARequest,
    LoginRequest,
    MessageResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserMe,
    VerifyEmailRequest,
)
from app.services.auth_service import AuthService
from app.services.captcha_service import CaptchaService
from app.services.storage_service import StorageService

router = APIRouter(prefix="/auth", tags=["auth"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


def _set_auth_cookies(response: Response, access: str, refresh: str, csrf: str) -> None:
    from app.core.config import get_settings

    settings = get_settings()
    secure = settings.app_env != "development"
    response.set_cookie("access_token", access, httponly=True, secure=secure, samesite="strict", max_age=settings.jwt_access_token_expire_minutes * 60)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=secure, samesite="strict", max_age=settings.jwt_refresh_token_expire_days * 86400)
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf,
        httponly=False,
        secure=settings.csrf_cookie_secure or secure,
        samesite=settings.csrf_cookie_samesite,
        max_age=3600,
    )


def _clear_auth_cookies(response: Response) -> None:
    from app.core.config import get_settings

    settings = get_settings()
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    response.delete_cookie(settings.csrf_cookie_name)


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    lang = _lang(request)
    if not await CaptchaService.verify(body.captcha_token, get_client_ip(request)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=t("auth.invalid_captcha", lang))
    service = AuthService(db)
    try:
        await service.register(
            username=body.username,
            email=body.email,
            password=body.password,
            ip=get_client_ip(request),
            locale=body.locale or lang,
            referral_code=body.referral_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MessageResponse(message=t("auth.registration_success", lang))


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(body: VerifyEmailRequest, request: Request, db: AsyncSession = Depends(get_db)):
    lang = _lang(request)
    service = AuthService(db)
    try:
        await service.verify_email(body.token, lang)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MessageResponse(message=t("auth.email_verified", lang))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    lang = _lang(request)
    if not await CaptchaService.verify(body.captcha_token, get_client_ip(request)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=t("auth.invalid_captcha", lang))
    service = AuthService(db)
    try:
        access, refresh, csrf, _ = await service.login(
            email=body.email,
            password=body.password,
            ip=get_client_ip(request),
            totp_code=body.totp_code,
            locale=lang,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    response = JSONResponse(TokenResponse(access_token=access, refresh_token=refresh, csrf_token=csrf).model_dump())
    _set_auth_cookies(response, access, refresh, csrf)
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    lang = _lang(request)
    service = AuthService(db)
    try:
        token = body.refresh_token or request.cookies.get("refresh_token")
        access, refresh_token, csrf = await service.refresh_tokens(token, lang)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    response = JSONResponse(TokenResponse(access_token=access, refresh_token=refresh_token, csrf_token=csrf).model_dump())
    _set_auth_cookies(response, access, refresh_token, csrf)
    return response


@router.post("/logout", response_model=MessageResponse)
async def logout(body: RefreshRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    lang = _lang(request)
    service = AuthService(db)
    await service.logout(body.refresh_token or request.cookies.get("refresh_token"))
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = verify_token(auth[7:], "access")
        if payload:
            await revoke_token_jti(payload.get("jti"), payload.get("exp"))
    _clear_auth_cookies(response)
    return MessageResponse(message=t("auth.logout_success", lang))


@router.post("/password-reset", response_model=MessageResponse)
async def password_reset(body: PasswordResetRequest, request: Request, db: AsyncSession = Depends(get_db)):
    lang = _lang(request)
    if not await CaptchaService.verify(body.captcha_token, get_client_ip(request)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=t("auth.invalid_captcha", lang))
    service = AuthService(db)
    await service.request_password_reset(body.email, lang)
    return MessageResponse(message=t("auth.reset_email_sent", lang))


@router.post("/password-reset/confirm", response_model=MessageResponse)
async def password_reset_confirm(
    body: PasswordResetConfirm, request: Request, db: AsyncSession = Depends(get_db)
):
    lang = _lang(request)
    service = AuthService(db)
    try:
        await service.reset_password(body.token, body.new_password, lang)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MessageResponse(message=t("auth.password_changed", lang))


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = AuthService(db)
    try:
        await service.change_password(user, body.current_password, body.new_password, lang)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MessageResponse(message=t("auth.password_changed", lang))


@router.get("/me", response_model=UserMe)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    from app.models.admin import AdminAccount

    admin_row = await db.execute(
        select(AdminAccount.id).where(AdminAccount.user_id == user.id, AdminAccount.is_active.is_(True))
    )
    return UserMe(
        id=str(user.id),
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=StorageService.generate_presigned_url(user.avatar_url),
        bio=user.bio,
        profile_visibility=user.profile_visibility.value,
        theme_mode=user.theme_mode.value,
        theme_primary=user.theme_primary,
        theme_accent=user.theme_accent,
        status_text=user.status_text,
        is_verified=user.is_verified,
        totp_enabled=user.totp_enabled,
        activity_points=user.activity_points,
        level=user.level,
        wallet_balance=user.wallet_balance,
        locale=user.locale,
        role=user.role.value,
        has_admin_panel=admin_row.scalar_one_or_none() is not None,
    )


@router.post("/2fa/setup")
async def setup_2fa(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    secret = await service.setup_2fa(user)
    import pyotp
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user.email, issuer_name="VortexM")
    return {"secret": secret, "provisioning_uri": uri}


@router.post("/2fa/enable", response_model=MessageResponse)
async def enable_2fa(
    body: Enable2FARequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = AuthService(db)
    try:
        await service.enable_2fa(user, body.totp_code, lang)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MessageResponse(message=t("auth.2fa_enabled", lang))


@router.post("/2fa/disable", response_model=MessageResponse)
async def disable_2fa(
    body: Enable2FARequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = AuthService(db)
    try:
        await service.disable_2fa(user, body.totp_code, lang)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MessageResponse(message=t("auth.2fa_disabled", lang))
