import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_optional, get_superadmin
from app.core.i18n import t
from app.models.channels import ChannelMemberRole, ChannelVisibility, PostType
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.channels import (
    BroadcastRequest,
    ChannelCreateRequest,
    ChannelMemberResponse,
    ChannelResponse,
    ChannelUpdateRequest,
    ChannelVerificationResponse,
    ChannelVerificationSubmitRequest,
    CommentCreateRequest,
    MemberRoleRequest,
    PollVoteRequest,
    PostCreateRequest,
    PostResponse,
    ProductCreateRequest,
    TransferOwnershipRequest,
)
from app.services.channel_service import ChannelService

router = APIRouter(prefix="/channels", tags=["channels"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


@router.post("", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_channel(
    body: ChannelCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    try:
        visibility = ChannelVisibility(body.visibility)
    except ValueError:
        raise HTTPException(status_code=400, detail=t("channels.invalid_visibility", lang))
    service = ChannelService(db)
    ch = await service.create_channel(user, body.title, body.description, visibility, body.subscription_price)
    member = await service._get_member(ch.id, user.id)
    return ChannelResponse(**service._channel_dict(ch, True, True, member))


@router.get("", response_model=list[ChannelResponse])
async def list_channels(
    q: str | None = None,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    service = ChannelService(db)
    return [ChannelResponse(**c) for c in await service.list_channels(user, q)]


@router.get("/{slug}", response_model=ChannelResponse)
async def get_channel(
    slug: str,
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        data = await service.get_channel(slug, user)
    except ValueError as e:
        code = 404 if e.args[0] != "channel_private" else 403
        raise HTTPException(status_code=code, detail=t(f"channels.{e}", lang))
    return ChannelResponse(**data)


@router.patch("/{slug}", response_model=ChannelResponse)
async def update_channel(
    slug: str,
    body: ChannelUpdateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    visibility = None
    if body.visibility is not None:
        try:
            visibility = ChannelVisibility(body.visibility)
        except ValueError:
            raise HTTPException(status_code=400, detail=t("channels.invalid_visibility", lang))
    service = ChannelService(db)
    try:
        data = await service.update_channel(
            user,
            slug,
            title=body.title,
            description=body.description,
            visibility=visibility,
            subscription_price=body.subscription_price,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return ChannelResponse(**data)


@router.post("/{slug}/join", response_model=ChannelResponse)
async def join_channel(
    slug: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        data = await service.join_channel(user, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return ChannelResponse(**data)


@router.post("/{slug}/leave", response_model=MessageResponse)
async def leave_channel(
    slug: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        await service.leave_channel(user, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return MessageResponse(message=t("channels.left", lang))


@router.get("/{slug}/posts", response_model=list[PostResponse])
async def list_posts(
    slug: str,
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        posts = await service.list_posts(slug, user)
    except ValueError as e:
        raise HTTPException(status_code=403 if e.args[0] == "channel_private" else 404, detail=t(f"channels.{e}", lang))
    return [PostResponse(**p) for p in posts]


@router.post("/{slug}/posts", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    slug: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    post_type: str = Form("text"),
    content: str | None = Form(None),
    is_paid: bool = Form(False),
    price: int = Form(0),
    is_announcement: bool = Form(False),
    poll_options: str | None = Form(None),
    quiz_correct_index: int | None = Form(None),
    event_starts_at: str | None = Form(None),
    event_location: str | None = Form(None),
    file: UploadFile | None = File(None),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        ptype = PostType(post_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=t("channels.invalid_post_type", lang))

    media_content = None
    media_type = None
    if file and file.filename:
        media_content = await file.read()
        media_type = file.content_type or "application/octet-stream"

    options = [o.strip() for o in poll_options.split("|")] if poll_options else None
    event_dt = datetime.fromisoformat(event_starts_at) if event_starts_at else None

    try:
        data = await service.create_post(
            user,
            slug,
            ptype,
            content,
            media_content,
            media_type,
            is_paid,
            price,
            is_announcement,
            options,
            quiz_correct_index,
            event_dt,
            event_location,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return PostResponse(**data)


@router.post("/posts/{post_id}/unlock", response_model=PostResponse)
async def unlock_post(
    post_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        data = await service.unlock_post(user, uuid.UUID(post_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return PostResponse(**data)


@router.post("/posts/{post_id}/vote", response_model=PostResponse)
async def vote_poll(
    post_id: str,
    body: PollVoteRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        data = await service.vote_poll(user, uuid.UUID(post_id), uuid.UUID(body.option_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return PostResponse(**data)


@router.post("/posts/{post_id}/comments", response_model=MessageResponse)
async def add_comment(
    post_id: str,
    body: CommentCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        await service.add_comment(user, uuid.UUID(post_id), body.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return MessageResponse(message=t("channels.comment_added", lang))


@router.post("/posts/{post_id}/pin", response_model=MessageResponse)
async def pin_post(
    post_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        await service.pin_post(user, uuid.UUID(post_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return MessageResponse(message=t("channels.post_pinned", lang))


@router.post("/{slug}/broadcast", response_model=dict)
async def broadcast(
    slug: str,
    body: BroadcastRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        return await service.send_broadcast(user, slug, body.content, body.mention_all)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))


@router.get("/{slug}/members", response_model=list[ChannelMemberResponse])
async def list_members(
    slug: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        members = await service.list_members(user, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return [ChannelMemberResponse(**m) for m in members]


@router.patch("/{slug}/members", response_model=MessageResponse)
async def update_member(
    slug: str,
    body: MemberRoleRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        role = ChannelMemberRole(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=t("channels.invalid_role", lang))
    perms = {k: v for k, v in body.model_dump().items() if k.startswith("can_") and v is not None}
    try:
        await service.set_member_role(user, slug, uuid.UUID(body.user_id), role, perms or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return MessageResponse(message=t("channels.member_updated", lang))


@router.post("/{slug}/transfer-ownership", response_model=ChannelResponse)
async def transfer_ownership(
    slug: str,
    body: TransferOwnershipRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        data = await service.transfer_ownership(user, slug, uuid.UUID(body.user_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return ChannelResponse(**data)


@router.get("/{slug}/verification")
async def get_channel_verification(
    slug: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        data = await service.get_verification_request(user, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    if not data:
        return JSONResponse(status_code=200, content=None)
    return ChannelVerificationResponse(**data)


@router.post("/{slug}/verification", response_model=ChannelVerificationResponse, status_code=status.HTTP_201_CREATED)
async def submit_channel_verification(
    slug: str,
    body: ChannelVerificationSubmitRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        data = await service.submit_verification_request(
            user,
            slug,
            body.reason,
            body.link_website,
            body.link_social,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
    return ChannelVerificationResponse(**data)


@router.post("/{slug}/verify", response_model=MessageResponse)
async def verify_channel(
    slug: str,
    request: Request,
    verified: bool = Query(True),
    _admin: User = Depends(get_superadmin),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        await service.verify_channel(slug, verified)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"channels.{e}", lang))
    return MessageResponse(message=t("channels.verified", lang))


@router.get("/{slug}/products", response_model=list[dict])
async def list_products(
    slug: str,
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    service = ChannelService(db)
    lang = _lang(request)
    try:
        return await service.list_products(slug, user)
    except ValueError as e:
        raise HTTPException(status_code=403 if e.args[0] == "channel_private" else 404, detail=t(f"channels.{e}", lang))


@router.post("/{slug}/products", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_product(
    slug: str,
    body: ProductCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ChannelService(db)
    try:
        return await service.create_product(user, slug, body.title, body.price, body.description)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"channels.{e}", lang))
