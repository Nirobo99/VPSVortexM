import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_optional, get_superadmin
from app.core.i18n import t
from app.models.user import ProfileVisibility, ThemeMode, User
from app.schemas.auth import MessageResponse
from app.schemas.profile import (
    AnonymousUserCreateRequest,
    BlockUserRequest,
    GamificationResponse,
    InvisibleSettingsRequest,
    ProfileResponse,
    ProfileUpdateRequest,
    PublicProfileResponse,
    StatusUpdateRequest,
    StoryCreateResponse,
    ThemeUpdateRequest,
    UsernameChangeRequest,
    VerificationSubmitRequest,
    VerificationRequestResponse,
    ProfilePostResponse,
)
from app.services.profile_service import ProfileService
from app.services.storage_service import StorageService
from app.services.verification_service import VerificationService

router = APIRouter(prefix="/users", tags=["users"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


@router.get("/me/profile", response_model=ProfileResponse)
async def get_my_profile(user: User = Depends(get_current_user)):
    return ProfileService.user_to_dict(user, full=True)


@router.patch("/me/profile", response_model=ProfileResponse)
async def update_my_profile(
    body: ProfileUpdateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    visibility = None
    if body.profile_visibility:
        try:
            visibility = ProfileVisibility(body.profile_visibility)
        except ValueError:
            raise HTTPException(status_code=400, detail=t("profile.invalid_visibility", lang))
    user = await service.update_profile(
        user,
        display_name=body.display_name,
        bio=body.bio,
        birth_date=body.birth_date,
        profile_visibility=visibility,
        locale=body.locale,
    )
    return ProfileService.user_to_dict(user, full=True)


@router.patch("/me/theme", response_model=ProfileResponse)
async def update_theme(
    body: ThemeUpdateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    theme_mode = None
    if body.theme_mode:
        try:
            theme_mode = ThemeMode(body.theme_mode)
        except ValueError:
            raise HTTPException(status_code=400, detail=t("profile.invalid_theme", lang))
    user = await service.update_theme(user, theme_mode, body.theme_primary, body.theme_accent)
    return ProfileService.user_to_dict(user, full=True)


@router.patch("/me/status", response_model=ProfileResponse)
async def update_status(
    body: StatusUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService(db)
    user = await service.update_status(user, body.status_text, body.status_emoji)
    return ProfileService.user_to_dict(user, full=True)


@router.get("/me/verification", response_model=VerificationRequestResponse | None)
async def get_my_verification(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = VerificationService(db)
    req = await service.get_latest_for_user(user.id)
    if not req:
        return None
    return VerificationRequestResponse(**service.request_to_dict(req))


@router.post("/me/verification", response_model=VerificationRequestResponse, status_code=status.HTTP_201_CREATED)
async def submit_verification(
    body: VerificationSubmitRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = VerificationService(db)
    try:
        req = await service.submit(user, body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"verification.{e}", lang))
    return VerificationRequestResponse(**service.request_to_dict(req))


@router.post("/me/avatar", response_model=ProfileResponse)
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    content = await file.read()
    service = ProfileService(db)
    try:
        user = await service.upload_avatar(user, content, file.content_type or "image/jpeg")
    except ValueError as e:
        key = str(e)
        msg = t(f"profile.{key}", lang) if key in ("file_too_large", "invalid_image_type") else str(e)
        raise HTTPException(status_code=400, detail=msg)
    return ProfileService.user_to_dict(user, full=True)


@router.patch("/me/username", response_model=ProfileResponse)
async def change_username(
    body: UsernameChangeRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    try:
        user = await service.change_username(user, body.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"profile.{e}", lang))
    return ProfileService.user_to_dict(user, full=True)


@router.patch("/me/invisible", response_model=ProfileResponse)
async def update_invisible(
    body: InvisibleSettingsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService(db)
    user = await service.update_invisible_settings(user, body.fake_last_seen)
    return ProfileService.user_to_dict(user, full=True)


@router.get("/me/qr")
async def get_qr_code(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = ProfileService(db)
    svg = service.generate_qr_svg(user)
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/me/gamification", response_model=GamificationResponse)
async def get_gamification(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    data = await service.gamification.get_user_gamification(user, lang)
    return GamificationResponse(**data)


@router.get("/me/blocks")
async def list_blocks(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = ProfileService(db)
    return await service.list_blocked_users(user)


@router.post("/me/blocks", response_model=MessageResponse)
async def block_user(
    body: BlockUserRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    try:
        await service.block_user(user, uuid.UUID(body.user_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"profile.{e}", lang))
    return MessageResponse(message=t("profile.user_blocked", lang))


@router.delete("/me/blocks/{blocked_user_id}", response_model=MessageResponse)
async def unblock_user(
    blocked_user_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    await service.unblock_user(user, uuid.UUID(blocked_user_id))
    return MessageResponse(message=t("profile.user_unblocked", lang))


@router.get("/me/stories", response_model=list[StoryCreateResponse])
async def my_stories(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = ProfileService(db)
    stories = await service.get_user_stories(user.id)
    return [
        StoryCreateResponse(
            id=str(s.id),
            media_url=StorageService.generate_presigned_url(s.media_url),
            media_type=s.media_type.value.lower(),
            text=s.text,
            expires_at=s.expires_at.isoformat(),
            created_at=s.created_at.isoformat(),
        )
        for s in stories
    ]


@router.post("/me/stories", response_model=StoryCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_story(
    request: Request,
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    content = None
    content_type = None
    if file and file.filename:
        content = await file.read()
        content_type = file.content_type
    try:
        story = await service.create_story(user, text, content, content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"profile.{e}", lang))
    return StoryCreateResponse(
        id=str(story.id),
        media_url=StorageService.generate_presigned_url(story.media_url),
        media_type=story.media_type.value.lower(),
        text=story.text,
        expires_at=story.expires_at.isoformat(),
        created_at=story.created_at.isoformat(),
    )


@router.delete("/me/stories/{story_id}", response_model=MessageResponse)
async def delete_story(
    story_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    try:
        await service.delete_story(user, uuid.UUID(story_id))
    except ValueError:
        raise HTTPException(status_code=404, detail=t("profile.story_not_found", lang))
    return MessageResponse(message=t("profile.story_deleted", lang))


def _post_response(post) -> ProfilePostResponse:
    return ProfilePostResponse(
        id=str(post.id),
        media_url=StorageService.generate_presigned_url(post.media_url),
        media_type=post.media_type.value.lower(),
        text=post.text,
        created_at=post.created_at.isoformat(),
    )


@router.get("/me/posts", response_model=list[ProfilePostResponse])
async def my_posts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = ProfileService(db)
    posts = await service.get_user_posts(user.id)
    return [_post_response(p) for p in posts]


@router.post("/me/posts", response_model=ProfilePostResponse, status_code=status.HTTP_201_CREATED)
async def create_profile_post(
    request: Request,
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    content = None
    content_type = None
    if file and file.filename:
        content = await file.read()
        content_type = file.content_type
    try:
        post = await service.create_profile_post(user, text, content, content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"profile.{e}", lang))
    return _post_response(post)


@router.delete("/me/posts/{post_id}", response_model=MessageResponse)
async def delete_profile_post(
    post_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    try:
        await service.delete_profile_post(user, uuid.UUID(post_id))
    except ValueError:
        raise HTTPException(status_code=404, detail=t("profile.post_not_found", lang))
    return MessageResponse(message=t("profile.post_deleted", lang))


@router.get("/{username}/posts", response_model=list[ProfilePostResponse])
async def user_posts(
    username: str,
    request: Request,
    viewer: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    try:
        profile = await service.get_public_profile(username, viewer)
        posts = await service.get_user_posts(uuid.UUID(profile["id"]))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"profile.{e}", lang))
    return [_post_response(p) for p in posts]


@router.get("/{username}/stories", response_model=list[StoryCreateResponse])
async def user_stories(
    username: str,
    request: Request,
    viewer: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    try:
        profile = await service.get_public_profile(username, viewer)
        stories = await service.get_user_stories(uuid.UUID(profile["id"]))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"profile.{e}", lang))
    return [
        StoryCreateResponse(
            id=str(s.id),
            media_url=StorageService.generate_presigned_url(s.media_url),
            media_type=s.media_type.value.lower(),
            text=s.text,
            expires_at=s.expires_at.isoformat(),
            created_at=s.created_at.isoformat(),
        )
        for s in stories
    ]


@router.get("/{username}", response_model=PublicProfileResponse)
async def get_public_profile(
    username: str,
    request: Request,
    viewer: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ProfileService(db)
    try:
        data = await service.get_public_profile(username, viewer)
    except ValueError as e:
        code = 404 if e.args[0] in ("user_not_found", "profile_private") else 403
        raise HTTPException(status_code=code, detail=t(f"profile.{e}", lang))
    return PublicProfileResponse(**{k: v for k, v in data.items() if k != "email" and k != "birth_date"})
