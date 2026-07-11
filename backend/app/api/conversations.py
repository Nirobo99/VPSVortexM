import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.i18n import t
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.channels import GroupAddMembersRequest, GroupCreateRequest, GroupResponse, SetAdminRequest
from app.services.conversation_service import ConversationService

router = APIRouter(prefix="/groups", tags=["groups"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ConversationService(db)
    try:
        data = await service.create_group(user, body.title, body.description, body.members)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"groups.{e}", lang))
    return GroupResponse(**data)


@router.get("", response_model=list[GroupResponse])
async def list_groups(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = ConversationService(db)
    return [GroupResponse(**g) for g in await service.list_groups(user)]


@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ConversationService(db)
    try:
        data = await service.get_group(user, uuid.UUID(group_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"groups.{e}", lang))
    return GroupResponse(**data)


@router.post("/{group_id}/members", response_model=GroupResponse)
async def add_members(
    group_id: str,
    body: GroupAddMembersRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ConversationService(db)
    try:
        data = await service.add_members(user, uuid.UUID(group_id), body.usernames)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"groups.{e}", lang))
    return GroupResponse(**data)


@router.post("/{group_id}/extend", response_model=GroupResponse)
async def extend_group(
    group_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ConversationService(db)
    try:
        data = await service.extend_limit(user, uuid.UUID(group_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"groups.{e}", lang))
    return GroupResponse(**data)


@router.patch("/{group_id}/admin", response_model=MessageResponse)
async def set_admin(
    group_id: str,
    body: SetAdminRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = ConversationService(db)
    try:
        await service.set_admin(user, uuid.UUID(group_id), uuid.UUID(body.user_id), body.is_admin)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"groups.{e}", lang))
    return MessageResponse(message=t("groups.admin_updated", lang))
