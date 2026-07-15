import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_deps import AdminContext, get_current_admin, require_permission
from app.core.database import get_db
from app.core.i18n import t
from app.core.ip_helper import get_client_ip
from app.models.admin import AdminAction
from app.schemas.admin import (
    AdminUserUpdateRequest,
    AnnouncementCreateRequest,
    ComplaintResolveRequest,
    PlatformSettingsUpdateRequest,
)
from app.schemas.admin_panel import (
    AdBannerRequest,
    AdminAccountCreateRequest,
    AdminAccountUpdateRequest,
    BroadcastCreateRequest,
    BulkBanRequest,
    PlatformSettingsFullUpdate,
    StaticPageUpdateRequest,
    WalletAdjustRequest,
)
from app.schemas.auth import MessageResponse
from app.schemas.profile import AnonymousUserCreateRequest, ProfileResponse, VerificationReviewRequest
from app.services.admin_auth_service import AdminAuthService
from app.services.admin_panel_service import AdminPanelService
from app.services.channel_service import ChannelService
from app.services.profile_service import ProfileService
from app.services.verification_service import VerificationService

router = APIRouter(prefix="/admin", tags=["admin-panel"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


def _ua(request: Request) -> str:
    return request.headers.get("User-Agent", "")[:512]


# ── Dashboard ──────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard(
    admin: AdminContext = Depends(require_permission("dashboard", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).get_dashboard()


# ── Users ──────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    q: str | None = None,
    verified: bool | None = None,
    banned: bool | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: AdminContext = Depends(require_permission("users", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_users_filtered(q, verified, banned, page, limit)


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    request: Request,
    admin: AdminContext = Depends(require_permission("users", "view")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        return await AdminPanelService(db).get_user_full(uuid.UUID(user_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"admin.{e}", lang))


@router.post("/users/{user_id}/ban", response_model=MessageResponse)
async def ban_user(
    user_id: str, request: Request,
    admin: AdminContext = Depends(require_permission("users", "ban")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    svc = AdminPanelService(db)
    try:
        await svc.ban_user(admin.user, uuid.UUID(user_id), get_client_ip(request))
        await svc.log_ctx(admin, AdminAction.USER_BAN, get_client_ip(request), _ua(request), "user", user_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"admin.{e}", lang))
    return MessageResponse(message=t("admin.user_banned", lang))


@router.post("/users/{user_id}/unban", response_model=MessageResponse)
async def unban_user(
    user_id: str, request: Request,
    admin: AdminContext = Depends(require_permission("users", "unban")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    svc = AdminPanelService(db)
    try:
        await svc.unban_user(admin.user, uuid.UUID(user_id), get_client_ip(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"admin.{e}", lang))
    return MessageResponse(message=t("admin.user_unbanned", lang))


@router.delete("/users/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: str, request: Request,
    admin: AdminContext = Depends(require_permission("users", "delete")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    svc = AdminPanelService(db)
    try:
        await svc.delete_user(admin.user, uuid.UUID(user_id), get_client_ip(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"admin.{e}", lang))
    return MessageResponse(message=t("admin.user_deleted", lang))


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str, body: AdminUserUpdateRequest, request: Request,
    admin: AdminContext = Depends(require_permission("users", "edit")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    svc = AdminPanelService(db)
    fields = body.model_dump(exclude_unset=True)
    try:
        await svc.update_user(admin.user, uuid.UUID(user_id), get_client_ip(request), **fields)
        data = await svc.get_user_full(uuid.UUID(user_id))
    except ValueError as e:
        key = "auth.superadmin_required" if e.args[0] == "superadmin_required" else f"admin.{e}"
        raise HTTPException(status_code=400, detail=t(key, lang))
    return data


@router.post("/users/bulk-ban")
async def bulk_ban(
    body: BulkBanRequest, request: Request,
    admin: AdminContext = Depends(require_permission("users", "ban")),
    db: AsyncSession = Depends(get_db),
):
    ids = [uuid.UUID(i) for i in body.user_ids]
    count = await AdminPanelService(db).bulk_ban(admin, ids, get_client_ip(request))
    return {"banned": count}


@router.get("/users/export/csv", response_class=PlainTextResponse)
async def export_users(
    admin: AdminContext = Depends(require_permission("users", "export")),
    db: AsyncSession = Depends(get_db),
):
    csv_data = await AdminPanelService(db).export_users_csv()
    return PlainTextResponse(csv_data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=users.csv"})


# ── Channels & Groups ──────────────────────────────────────

@router.get("/channels")
async def list_channels(
    q: str | None = None,
    admin: AdminContext = Depends(require_permission("channels", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_channels(q)


@router.delete("/channels/{slug}", response_model=MessageResponse)
async def delete_channel(
    slug: str, request: Request,
    admin: AdminContext = Depends(require_permission("channels", "delete")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        await AdminPanelService(db).delete_channel(admin, slug, get_client_ip(request))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"channels.{e}", lang))
    return MessageResponse(message=t("admin_panel.channel_deleted", lang))


@router.post("/channels/{slug}/verify", response_model=MessageResponse)
async def verify_channel(
    slug: str, request: Request, verified: bool = Query(True),
    admin: AdminContext = Depends(require_permission("channels", "verify")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        await AdminPanelService(db).verify_channel(admin, slug, verified, get_client_ip(request))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"channels.{e}", lang))
    return MessageResponse(message=t("channels.verified", lang))


@router.get("/groups")
async def list_groups(
    q: str | None = None,
    admin: AdminContext = Depends(require_permission("groups", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_groups(q)


# ── Complaints ─────────────────────────────────────────────

@router.get("/complaints")
async def list_complaints(
    request: Request, status: str | None = None,
    admin: AdminContext = Depends(require_permission("complaints", "view")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        return await AdminPanelService(db).list_complaints(status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"admin.{e}", lang))


@router.post("/complaints/{complaint_id}/assign")
async def assign_complaint(
    complaint_id: str, request: Request,
    admin: AdminContext = Depends(require_permission("complaints", "resolve")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        return await AdminPanelService(db).assign_complaint(uuid.UUID(complaint_id), admin.user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"admin.{e}", lang))


@router.post("/complaints/{complaint_id}/resolve")
async def resolve_complaint(
    complaint_id: str, body: ComplaintResolveRequest, request: Request,
    admin: AdminContext = Depends(require_permission("complaints", "resolve")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        return await AdminPanelService(db).resolve_complaint(
            admin.user, uuid.UUID(complaint_id), body.status, body.admin_note, get_client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"admin.{e}", lang))


# ── Verification ───────────────────────────────────────────

@router.get("/verification")
async def list_verification_requests(
    status: str | None = Query(None),
    admin: AdminContext = Depends(require_permission("users", "verify")),
    db: AsyncSession = Depends(get_db),
):
    return await VerificationService(db).list_requests(status)


@router.post("/verification/{request_id}/review")
async def review_verification_request(
    request_id: str,
    body: VerificationReviewRequest,
    request: Request,
    admin: AdminContext = Depends(require_permission("users", "verify")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        return await VerificationService(db).review(
            admin.user, uuid.UUID(request_id), body.approve, body.admin_note
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"verification.{e}", lang))


# ── Channel verification ────────────────────────────────────

@router.get("/channel-verification")
async def list_channel_verification_requests(
    status: str | None = Query(None),
    admin: AdminContext = Depends(require_permission("channels", "verify")),
    db: AsyncSession = Depends(get_db),
):
    return await ChannelService(db).list_verification_requests(status)


@router.post("/channel-verification/{request_id}/review")
async def review_channel_verification_request(
    request_id: str,
    body: VerificationReviewRequest,
    request: Request,
    admin: AdminContext = Depends(require_permission("channels", "verify")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        return await ChannelService(db).review_verification_request(
            admin.user, uuid.UUID(request_id), body.approve, body.admin_note
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))


# ── Ads ────────────────────────────────────────────────────

@router.get("/ads")
async def list_ads(
    admin: AdminContext = Depends(require_permission("ads", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_ads()


@router.post("/ads", status_code=201)
async def create_ad(
    body: AdBannerRequest, request: Request,
    admin: AdminContext = Depends(require_permission("ads", "edit")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).create_ad(admin, body.model_dump(), get_client_ip(request))


@router.delete("/ads/{ad_id}")
async def delete_ad(
    ad_id: str, request: Request,
    admin: AdminContext = Depends(require_permission("ads", "edit")),
    db: AsyncSession = Depends(get_db),
):
    await AdminPanelService(db).delete_ad(admin, uuid.UUID(ad_id), get_client_ip(request))
    return {"message": "ok"}


# ── Broadcasts ─────────────────────────────────────────────

@router.get("/broadcasts")
async def list_broadcasts(
    admin: AdminContext = Depends(require_permission("broadcasts", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_broadcasts()


@router.post("/broadcasts", status_code=201)
async def create_broadcast(
    body: BroadcastCreateRequest, request: Request,
    admin: AdminContext = Depends(require_permission("broadcasts", "send")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).create_broadcast(admin, body.model_dump(exclude_none=True), get_client_ip(request))


@router.post("/broadcasts/{broadcast_id}/send")
async def send_broadcast(
    broadcast_id: str, request: Request,
    admin: AdminContext = Depends(require_permission("broadcasts", "send")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).send_broadcast(admin, uuid.UUID(broadcast_id), get_client_ip(request))


# ── Static pages ─────────────────────────────────────────

@router.get("/pages")
async def list_pages(
    admin: AdminContext = Depends(require_permission("pages", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_pages()


@router.put("/pages/{slug}")
async def update_page(
    slug: str, body: StaticPageUpdateRequest, request: Request,
    admin: AdminContext = Depends(require_permission("pages", "edit")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).update_page(admin, slug, body.title, body.content_html, get_client_ip(request))


# ── Settings ─────────────────────────────────────────────

@router.get("/settings")
async def get_settings(
    admin: AdminContext = Depends(require_permission("settings", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).get_settings_full()


@router.patch("/settings")
async def update_settings(
    body: PlatformSettingsFullUpdate, request: Request,
    admin: AdminContext = Depends(require_permission("settings", "edit")),
    db: AsyncSession = Depends(get_db),
):
    if body.allowed_admin_ips is not None and not admin.can("settings", "critical"):
        raise HTTPException(status_code=403, detail=t("admin_panel.forbidden", _lang(request)))
    return await AdminPanelService(db).update_settings_full(
        admin, get_client_ip(request), **body.model_dump(exclude_unset=True)
    )


# ── Finance ──────────────────────────────────────────────

@router.get("/finance")
async def list_finance(
    user_id: str | None = None, page: int = 1,
    admin: AdminContext = Depends(require_permission("finance", "view")),
    db: AsyncSession = Depends(get_db),
):
    uid = uuid.UUID(user_id) if user_id else None
    return await AdminPanelService(db).list_finance(uid, page)


@router.post("/finance/users/{user_id}/adjust")
async def adjust_wallet(
    user_id: str, body: WalletAdjustRequest, request: Request,
    admin: AdminContext = Depends(require_permission("finance", "adjust")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        return await AdminPanelService(db).adjust_wallet(
            admin, uuid.UUID(user_id), body.amount, body.reason, get_client_ip(request)
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"admin.{e}", lang))


# ── Logs ─────────────────────────────────────────────────

@router.get("/logs")
async def list_logs(
    limit: int = Query(50, ge=1, le=200),
    admin: AdminContext = Depends(require_permission("logs", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_logs(limit)


# ── Backups ──────────────────────────────────────────────

@router.get("/backups")
async def list_backups(
    admin: AdminContext = Depends(require_permission("backups", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_backups()


@router.post("/backups")
async def create_backup(
    request: Request,
    admin: AdminContext = Depends(require_permission("backups", "create")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).create_backup(admin, get_client_ip(request))


# ── Admin accounts ───────────────────────────────────────

@router.get("/accounts")
async def list_accounts(
    admin: AdminContext = Depends(require_permission("admins", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminAuthService(db).list_admin_accounts()


@router.post("/accounts", status_code=201)
async def create_account(
    body: AdminAccountCreateRequest, request: Request,
    admin: AdminContext = Depends(require_permission("admins", "manage")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        acc = await AdminAuthService(db).create_admin_account(
            body.email, body.role, body.permissions, locale=lang
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"admin_panel.{e}", lang))
    return {"id": str(acc.id), "role": acc.role}


@router.patch("/accounts/{account_id}")
async def update_account(
    account_id: str, body: AdminAccountUpdateRequest, request: Request,
    admin: AdminContext = Depends(require_permission("admins", "manage")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        acc = await AdminAuthService(db).update_admin_account(
            uuid.UUID(account_id),
            body.role,
            body.permissions,
            body.is_active,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"admin_panel.{e}", lang))
    return {"id": str(acc.id), "role": acc.role, "is_active": acc.is_active}


# ── Announcements (legacy) ─────────────────────────────

@router.get("/announcements")
async def list_announcements(
    admin: AdminContext = Depends(require_permission("broadcasts", "view")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).list_announcements()


@router.post("/announcements", status_code=201)
async def create_announcement(
    body: AnnouncementCreateRequest, request: Request,
    admin: AdminContext = Depends(require_permission("broadcasts", "send")),
    db: AsyncSession = Depends(get_db),
):
    return await AdminPanelService(db).create_announcement(
        admin.user, body.title, body.content, body.is_active, get_client_ip(request)
    )


# ── Superadmin commands ──────────────────────────────────

@router.post("/superadmin/command")
async def superadmin_command(
    request: Request,
    command: str = Query(...),
    confirm: str = Query(...),
    admin: AdminContext = Depends(require_permission("superadmin", "commands")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    if confirm != "CONFIRM":
        raise HTTPException(status_code=400, detail=t("admin_panel.confirm_required", lang))
    svc = AdminPanelService(db)
    if command == "purge_inactive_users":
        await svc.log_ctx(admin, AdminAction.SETTINGS_UPDATE, get_client_ip(request), _ua(request), description="purge_inactive_users")
        await db.commit()
        return {"message": "Command queued"}
    raise HTTPException(status_code=400, detail=t("admin_panel.unknown_command", lang))


@router.post("/anonymous-users", response_model=ProfileResponse, status_code=201)
async def create_anonymous_user(
    body: AnonymousUserCreateRequest, request: Request,
    admin: AdminContext = Depends(require_permission("superadmin", "commands")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        user = await ProfileService.create_anonymous_user(
            db, username=body.username, display_name=body.display_name,
            mask_face=body.mask_face, mask_voice=body.mask_voice,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"profile.{e}", lang))
    svc = AdminPanelService(db)
    await svc.log_ctx(admin, AdminAction.ANONYMOUS_CREATE, get_client_ip(request), _ua(request), "user", str(user.id), body.username)
    await db.commit()
    return ProfileService.user_to_dict(user, full=True)

# Legacy stats alias
@router.get("/stats")
async def stats_alias(
    admin: AdminContext = Depends(require_permission("dashboard", "view")),
    db: AsyncSession = Depends(get_db),
):
    d = await AdminPanelService(db).get_dashboard()
    return {
        "users_total": d["users_total"],
        "users_active": d["users_active_today"],
        "users_banned": 0,
        "channels_total": d["channels_total"],
        "messages_total": d["messages_total"],
        "complaints_pending": d["complaints_new"],
        "revenue_total": d["revenue_total"],
    }
