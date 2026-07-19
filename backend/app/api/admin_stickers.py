import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_deps import AdminContext, require_permission
from app.core.database import get_db
from app.core.i18n import t
from app.schemas.auth import MessageResponse
from app.schemas.sticker import RejectPackRequest, StickerPackDetail, StickerStatsResponse
from app.services.sticker_service import StickerService

router = APIRouter(prefix="/admin/stickers", tags=["admin-stickers"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


async def _read_upload(file: UploadFile | None) -> tuple[bytes, str] | None:
    if not file or not file.filename:
        return None
    return await file.read(), (file.content_type or "image/png")


@router.get("/moderation", response_model=list[StickerPackDetail])
async def list_moderation(
    status_filter: str | None = Query(None, alias="status"),
    admin: AdminContext = Depends(require_permission("channels", "view")),
    db: AsyncSession = Depends(get_db),
):
    service = StickerService(db)
    return [StickerPackDetail(**p) for p in await service.list_moderation(status_filter)]


@router.post("/moderation/{pack_id}/approve", response_model=StickerPackDetail)
async def approve_pack(
    pack_id: str,
    request: Request,
    admin: AdminContext = Depends(require_permission("channels", "edit")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        data = await service.approve_pack(admin.user, uuid.UUID(pack_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.post("/moderation/{pack_id}/reject", response_model=StickerPackDetail)
async def reject_pack(
    pack_id: str,
    body: RejectPackRequest,
    request: Request,
    admin: AdminContext = Depends(require_permission("channels", "edit")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        data = await service.reject_pack(admin.user, uuid.UUID(pack_id), body.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.get("/official", response_model=list[StickerPackDetail])
async def list_official(
    admin: AdminContext = Depends(require_permission("channels", "view")),
    db: AsyncSession = Depends(get_db),
):
    return [StickerPackDetail(**p) for p in await StickerService(db).list_official()]


@router.post("/official", response_model=StickerPackDetail, status_code=status.HTTP_201_CREATED)
async def create_official(
    request: Request,
    name: str = Form(...),
    description: str | None = Form(None),
    price: float = Form(0),
    is_active: bool = Form(True),
    cover: UploadFile | None = File(None),
    stickers: list[UploadFile] = File(default=[]),
    admin: AdminContext = Depends(require_permission("channels", "edit")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    cover_data = await _read_upload(cover)
    files: list[tuple[bytes, str]] = []
    for f in stickers or []:
        item = await _read_upload(f)
        if item:
            files.append(item)
    try:
        data = await service.create_official(
            admin.user, name, description, Decimal(str(price)), cover_data, files, is_active
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.put("/official/{pack_id}", response_model=StickerPackDetail)
async def update_official(
    pack_id: str,
    request: Request,
    name: str | None = Form(None),
    description: str | None = Form(None),
    price: float | None = Form(None),
    is_active: bool | None = Form(None),
    cover: UploadFile | None = File(None),
    admin: AdminContext = Depends(require_permission("channels", "edit")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    cover_data = await _read_upload(cover)
    try:
        data = await service.update_official(
            uuid.UUID(pack_id),
            name=name,
            description=description,
            price=Decimal(str(price)) if price is not None else None,
            is_active=is_active,
            cover=cover_data,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.delete("/official/{pack_id}", response_model=MessageResponse)
async def delete_official(
    pack_id: str,
    request: Request,
    admin: AdminContext = Depends(require_permission("channels", "edit")),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        await StickerService(db).delete_official(uuid.UUID(pack_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return MessageResponse(message=t("stickers.pack_deleted", lang))


@router.get("/stats", response_model=StickerStatsResponse)
async def sticker_stats(
    admin: AdminContext = Depends(require_permission("finance", "view")),
    db: AsyncSession = Depends(get_db),
):
    return StickerStatsResponse(**(await StickerService(db).stats()))
