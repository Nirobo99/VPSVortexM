import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.i18n import t
from app.models.messaging import MessageType
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.messaging import (
    DialogCreateRequest,
    DialogDetailResponse,
    DialogListItem,
    DialogParticipantInfo,
    E2EKeyRequest,
    FolderCreateRequest,
    FolderResponse,
    FolderUpdateRequest,
    MessageEditRequest,
    MessageForwardRequest,
    MessageReactionRequest,
    MessageResponse as MsgResponse,
    MessageSendRequest,
    MessagesPageResponse,
    MoveDialogFolderRequest,
    ReactionResponse,
    ReplyPreview,
    SearchResponse,
    SearchResultItem,
)
from app.services.messaging_service import MessagingService
from app.services.storage_service import StorageService

router = APIRouter(prefix="/chats", tags=["chats"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


def _participant_info(user, e2e_key=None) -> DialogParticipantInfo:
    return DialogParticipantInfo(
        id=str(user.id),
        username=user.username,
        display_name=user.display_name,
        avatar_url=StorageService.generate_presigned_url(user.avatar_url),
        e2e_public_key=e2e_key,
    )


@router.get("/folders", response_model=list[FolderResponse])
async def list_folders(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = MessagingService(db)
    folders = await service.list_folders(user)
    return [
        FolderResponse(id=str(f.id), name=f.name, position=f.position, created_at=f.created_at.isoformat())
        for f in folders
    ]


@router.post("/folders", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    body: FolderCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = MessagingService(db)
    folder = await service.create_folder(user, body.name)
    return FolderResponse(id=str(folder.id), name=folder.name, position=folder.position, created_at=folder.created_at.isoformat())


@router.patch("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    body: FolderUpdateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        folder = await service.update_folder(user, uuid.UUID(folder_id), body.name, body.position)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"chats.{e}", lang))
    return FolderResponse(id=str(folder.id), name=folder.name, position=folder.position, created_at=folder.created_at.isoformat())


@router.delete("/folders/{folder_id}", response_model=MessageResponse)
async def delete_folder(
    folder_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        await service.delete_folder(user, uuid.UUID(folder_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.folder_deleted", lang))


@router.get("/dialogs", response_model=list[DialogListItem])
async def list_dialogs(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = MessagingService(db)
    items = await service.list_dialogs(user)
    result = []
    for item in items:
        dialog = item["dialog"]
        participant = item["participant"]
        other = item["other_user"]
        result.append(
            DialogListItem(
                id=str(dialog.id),
                dialog_type=dialog.dialog_type.value.lower(),
                is_secret=dialog.dialog_type.value == "secret",
                is_group=dialog.dialog_type.value == "group",
                title=dialog.title,
                member_count=item.get("member_count"),
                folder_id=str(participant.folder_id) if participant.folder_id else None,
                unread_count=item["unread_count"],
                pinned_message_id=str(participant.pinned_message_id) if participant.pinned_message_id else None,
                auto_delete_seconds=dialog.auto_delete_seconds,
                last_message_at=dialog.last_message_at.isoformat() if dialog.last_message_at else None,
                other_user=_participant_info(other) if other else None,
                last_message_preview=item["last_message_preview"],
            )
        )
    return result


@router.post("/dialogs", response_model=DialogDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_dialog(
    body: DialogCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    if body.user_id:
        other_id = uuid.UUID(body.user_id)
        result = await db.execute(select(User).where(User.id == other_id))
    elif body.username:
        result = await db.execute(select(User).where(User.username == body.username))
    else:
        raise HTTPException(status_code=400, detail=t("chats.user_required", lang))
    other = result.scalar_one_or_none()
    if not other:
        raise HTTPException(status_code=404, detail=t("profile.user_not_found", lang))
    try:
        dialog = await service.get_or_create_dialog(user, other, body.is_secret, body.auto_delete_seconds)
        detail = await service.get_dialog_detail(user, dialog.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"chats.{e}", lang))

    d = detail["dialog"]
    p = detail["participant"]
    return DialogDetailResponse(
        id=str(d.id),
        dialog_type=d.dialog_type.value.lower(),
        is_secret=d.dialog_type.value == "secret",
        is_group=d.dialog_type.value == "group",
        title=d.title,
        member_count=len(detail["participants"]) if d.dialog_type.value == "group" else None,
        folder_id=str(p.folder_id) if p.folder_id else None,
        pinned_message_id=str(p.pinned_message_id) if p.pinned_message_id else None,
        auto_delete_seconds=d.auto_delete_seconds,
        participants=[
            _participant_info(item["user"], item["e2e_public_key"]) for item in detail["participants"]
        ],
        unread_count=detail["unread_count"],
    )


@router.get("/dialogs/{dialog_id}", response_model=DialogDetailResponse)
async def get_dialog(
    dialog_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        detail = await service.get_dialog_detail(user, uuid.UUID(dialog_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"chats.{e}", lang))
    d = detail["dialog"]
    p = detail["participant"]
    return DialogDetailResponse(
        id=str(d.id),
        dialog_type=d.dialog_type.value.lower(),
        is_secret=d.dialog_type.value == "secret",
        is_group=d.dialog_type.value == "group",
        title=d.title,
        member_count=len(detail["participants"]) if d.dialog_type.value == "group" else None,
        folder_id=str(p.folder_id) if p.folder_id else None,
        pinned_message_id=str(p.pinned_message_id) if p.pinned_message_id else None,
        auto_delete_seconds=d.auto_delete_seconds,
        participants=[
            _participant_info(item["user"], item["e2e_public_key"]) for item in detail["participants"]
        ],
        unread_count=detail["unread_count"],
    )


@router.post("/dialogs/{dialog_id}/read", response_model=MessageResponse)
async def mark_read(
    dialog_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        await service.mark_read(user, uuid.UUID(dialog_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.marked_read", lang))


@router.patch("/dialogs/{dialog_id}/folder", response_model=MessageResponse)
async def move_folder(
    dialog_id: str,
    body: MoveDialogFolderRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    folder_id = uuid.UUID(body.folder_id) if body.folder_id else None
    try:
        await service.move_dialog_folder(user, uuid.UUID(dialog_id), folder_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.folder_moved", lang))


@router.post("/dialogs/{dialog_id}/pin/{message_id}", response_model=MessageResponse)
async def pin_message(
    dialog_id: str,
    message_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        await service.pin_message(user, uuid.UUID(dialog_id), uuid.UUID(message_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.message_pinned", lang))


@router.delete("/dialogs/{dialog_id}/pin", response_model=MessageResponse)
async def unpin_message(
    dialog_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        await service.pin_message(user, uuid.UUID(dialog_id), None)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.message_unpinned", lang))


@router.post("/dialogs/{dialog_id}/e2e-key", response_model=MessageResponse)
async def set_e2e_key(
    dialog_id: str,
    body: E2EKeyRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        await service.set_e2e_key(user, uuid.UUID(dialog_id), body.public_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.e2e_key_set", lang))


def _to_msg_response(data: dict) -> MsgResponse:
    reply = None
    if data.get("reply_to"):
        r = data["reply_to"]
        reply = ReplyPreview(**r)
    reactions = [ReactionResponse(**re) for re in data.get("reactions", [])]
    return MsgResponse(
        id=data["id"],
        dialog_id=data["dialog_id"],
        sender_id=data["sender_id"],
        sender_username=data["sender_username"],
        sender_display_name=data["sender_display_name"],
        message_type=data["message_type"],
        content=data.get("content"),
        content_e2e=data.get("content_e2e"),
        media_url=data.get("media_url"),
        media_type=data.get("media_type"),
        file_name=data.get("file_name"),
        file_size=data.get("file_size"),
        reply_to=reply,
        forward_from_message_id=data.get("forward_from_message_id"),
        is_edited=data["is_edited"],
        is_deleted=data["is_deleted"],
        auto_delete_at=data.get("auto_delete_at"),
        reactions=reactions,
        created_at=data["created_at"],
    )


@router.get("/dialogs/{dialog_id}/messages", response_model=MessagesPageResponse)
async def get_messages(
    dialog_id: str,
    request: Request,
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        page = await service.get_messages(user, uuid.UUID(dialog_id), cursor, limit)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"chats.{e}", lang))
    return MessagesPageResponse(
        messages=[_to_msg_response(m) for m in page["messages"]],
        has_more=page["has_more"],
        next_cursor=page["next_cursor"],
    )


@router.post("/dialogs/{dialog_id}/messages", response_model=MsgResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    dialog_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    message_type: str = Form("text"),
    content: str | None = Form(None),
    content_e2e: str | None = Form(None),
    reply_to_id: str | None = Form(None),
    auto_delete_seconds: int | None = Form(None),
    file: UploadFile | None = File(None),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        mtype = MessageType(message_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=t("chats.invalid_message_type", lang))

    media_content = None
    media_type = None
    file_name = None
    if file and file.filename:
        media_content = await file.read()
        media_type = file.content_type or "application/octet-stream"
        file_name = file.filename

    try:
        msg = await service.send_message(
            user,
            uuid.UUID(dialog_id),
            mtype,
            content=content,
            content_e2e=content_e2e,
            reply_to_id=uuid.UUID(reply_to_id) if reply_to_id else None,
            auto_delete_seconds=auto_delete_seconds,
            media_content=media_content,
            media_content_type=media_type,
            file_name=file_name,
        )
    except ValueError as e:
        key = str(e)
        raise HTTPException(status_code=400, detail=t(f"chats.{key}", lang))
    return _to_msg_response(msg)


@router.patch("/messages/{message_id}", response_model=MsgResponse)
async def edit_message(
    message_id: str,
    body: MessageEditRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        msg = await service.edit_message(user, uuid.UUID(message_id), body.content, body.content_e2e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"chats.{e}", lang))
    return _to_msg_response(msg)


@router.delete("/messages/{message_id}", response_model=MessageResponse)
async def delete_message(
    message_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        await service.delete_message(user, uuid.UUID(message_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.message_deleted", lang))


@router.post("/messages/{message_id}/reactions", response_model=MessageResponse)
async def add_reaction(
    message_id: str,
    body: MessageReactionRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        await service.add_reaction(user, uuid.UUID(message_id), body.emoji)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.reaction_added", lang))


@router.delete("/messages/{message_id}/reactions/{emoji}", response_model=MessageResponse)
async def remove_reaction(
    message_id: str,
    emoji: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        await service.remove_reaction(user, uuid.UUID(message_id), emoji)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"chats.{e}", lang))
    return MessageResponse(message=t("chats.reaction_removed", lang))


@router.post("/messages/{message_id}/forward", response_model=list[MsgResponse])
async def forward_message(
    message_id: str,
    body: MessageForwardRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = MessagingService(db)
    try:
        msgs = await service.forward_message(
            user, uuid.UUID(message_id), [uuid.UUID(d) for d in body.dialog_ids]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"chats.{e}", lang))
    return [_to_msg_response(m) for m in msgs]


@router.get("/search", response_model=SearchResponse)
async def search_messages(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = MessagingService(db)
    data = await service.search_messages(user, q, limit)
    return SearchResponse(
        results=[
            SearchResultItem(
                message=_to_msg_response(item["message"]),
                dialog_id=item["dialog_id"],
                other_username=item["other_username"],
            )
            for item in data["results"]
        ],
        total=data["total"],
    )
