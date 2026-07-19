import json
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.core.i18n import t
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.sticker import (
    InstalledPacksResponse,
    MarketplacePage,
    StickerPackCard,
    StickerPackDetail,
    StickerReorderRequest,
)
from app.services.sticker_service import StickerService

router = APIRouter(prefix="/stickers", tags=["stickers"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


async def _read_upload(file: UploadFile | None) -> tuple[bytes, str] | None:
    if not file or not file.filename:
        return None
    data = await file.read()
    ctype = file.content_type or "image/png"
    return data, ctype


@router.post("/packs", response_model=StickerPackDetail, status_code=status.HTTP_201_CREATED)
async def create_pack(
    request: Request,
    name: str = Form(...),
    description: str | None = Form(None),
    price: float = Form(...),
    submit: bool = Form(True),
    cover: UploadFile | None = File(None),
    stickers: list[UploadFile] = File(default=[]),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    cover_data = await _read_upload(cover)
    sticker_files: list[tuple[bytes, str]] = []
    for f in stickers or []:
        item = await _read_upload(f)
        if item:
            sticker_files.append(item)
    try:
        data = await service.create_user_pack(
            user, name, description, Decimal(str(price)), cover_data, sticker_files, submit=submit
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.get("/packs/my", response_model=list[StickerPackCard])
async def my_created_packs(
    status_filter: str | None = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = StickerService(db)
    return [StickerPackCard(**p) for p in await service.list_my_created(user, status_filter)]


@router.put("/packs/{pack_id}", response_model=StickerPackDetail)
async def update_pack(
    pack_id: str,
    request: Request,
    name: str | None = Form(None),
    description: str | None = Form(None),
    price: float | None = Form(None),
    submit: bool = Form(False),
    cover: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    cover_data = await _read_upload(cover)
    try:
        data = await service.update_user_pack(
            user,
            uuid.UUID(pack_id),
            name=name,
            description=description,
            price=Decimal(str(price)) if price is not None else None,
            cover=cover_data,
            submit=submit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.delete("/packs/{pack_id}", response_model=MessageResponse)
async def delete_pack(
    pack_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        await service.delete_user_pack(user, uuid.UUID(pack_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return MessageResponse(message=t("stickers.pack_deleted", lang))


@router.post("/packs/{pack_id}/stickers", response_model=StickerPackDetail)
async def add_stickers(
    pack_id: str,
    request: Request,
    stickers: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    files: list[tuple[bytes, str]] = []
    for f in stickers or []:
        item = await _read_upload(f)
        if item:
            files.append(item)
    try:
        data = await service.add_stickers(user, uuid.UUID(pack_id), files)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.delete("/packs/{pack_id}/stickers/{sticker_id}", response_model=StickerPackDetail)
async def delete_sticker(
    pack_id: str,
    sticker_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        data = await service.delete_sticker(user, uuid.UUID(pack_id), uuid.UUID(sticker_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.put("/packs/{pack_id}/stickers/reorder", response_model=StickerPackDetail)
async def reorder_stickers(
    pack_id: str,
    body: StickerReorderRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        data = await service.reorder_stickers(
            user, uuid.UUID(pack_id), [i.model_dump() for i in body.items]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.get("/marketplace", response_model=MarketplacePage)
async def marketplace(
    type: str = Query("all"),
    paid: str = Query("all"),
    sort: str = Query("popular"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    service = StickerService(db)
    data = await service.marketplace(
        user, type_filter=type, paid=paid, sort=sort, search=search, page=page, limit=limit
    )
    return MarketplacePage(**data)


@router.get("/marketplace/{pack_id}", response_model=StickerPackDetail)
async def marketplace_detail(
    pack_id: str,
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        data = await service.pack_detail(user, uuid.UUID(pack_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.post("/marketplace/{pack_id}/buy", response_model=StickerPackDetail)
async def buy_pack(
    pack_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        data = await service.buy_pack(user, uuid.UUID(pack_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.get("/my", response_model=InstalledPacksResponse)
async def my_installed(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = StickerService(db)
    data = await service.list_installed(user)
    return InstalledPacksResponse(
        packs=[StickerPackDetail(**p) for p in data["packs"]],
        installed_count=data["installed_count"],
        slot_limit=data["slot_limit"],
        slots_used=data["slots_used"],
    )


@router.post("/my/{pack_id}/install", response_model=StickerPackDetail)
async def install_pack(
    pack_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        data = await service.install_free(user, uuid.UUID(pack_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return StickerPackDetail(**data)


@router.delete("/my/{pack_id}/remove", response_model=MessageResponse)
async def remove_pack(
    pack_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = StickerService(db)
    try:
        await service.uninstall(user, uuid.UUID(pack_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"stickers.{e}", lang))
    return MessageResponse(message=t("stickers.pack_removed", lang))
