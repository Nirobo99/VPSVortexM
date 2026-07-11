import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.i18n import t
from app.models.calls import CallType
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.calls import (
    CallCreateRequest,
    CallParticipantResponse,
    CallResponse,
    JoinCallResponse,
    RecordingResponse,
)
from app.services.call_service import CallService

router = APIRouter(prefix="/calls", tags=["calls"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


def _to_call_response(data: dict) -> CallResponse:
    return CallResponse(
        id=data["id"],
        dialog_id=data["dialog_id"],
        room_name=data["room_name"],
        call_type=data["call_type"],
        status=data["status"],
        initiator_id=data["initiator_id"],
        is_group=data["is_group"],
        max_participants=data["max_participants"],
        is_recording=data["is_recording"],
        recording_started_at=data["recording_started_at"],
        started_at=data["started_at"],
        ended_at=data["ended_at"],
        created_at=data["created_at"],
        participants=[CallParticipantResponse(**p) for p in data["participants"]],
    )


@router.post("", response_model=CallResponse, status_code=status.HTTP_201_CREATED)
async def create_call(
    body: CallCreateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = CallService(db)
    try:
        ctype = CallType(body.call_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=t("calls.invalid_call_type", lang))
    try:
        data = await service.create_call(user, uuid.UUID(body.dialog_id), ctype, body.is_group)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"calls.{e}", lang))
    return _to_call_response(data)


@router.get("/dialog/{dialog_id}/active", response_model=CallResponse | None)
async def active_call_for_dialog(
    dialog_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = CallService(db)
    try:
        data = await service.get_active_call_for_dialog(user, uuid.UUID(dialog_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"calls.{e}", lang))
    return _to_call_response(data) if data else None


@router.get("/{call_id}", response_model=CallResponse)
async def get_call(
    call_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = CallService(db)
    try:
        data = await service.get_call(user, uuid.UUID(call_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"calls.{e}", lang))
    return _to_call_response(data)


@router.post("/{call_id}/join", response_model=JoinCallResponse)
async def join_call(
    call_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = CallService(db)
    try:
        data = await service.join_call(user, uuid.UUID(call_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"calls.{e}", lang))
    return JoinCallResponse(
        token=data["token"],
        livekit_url=data["livekit_url"],
        room_name=data["room_name"],
        call=_to_call_response(data["call"]),
    )


@router.post("/{call_id}/decline", response_model=MessageResponse)
async def decline_call(
    call_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = CallService(db)
    try:
        await service.decline_call(user, uuid.UUID(call_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"calls.{e}", lang))
    return MessageResponse(message=t("calls.declined", lang))


@router.post("/{call_id}/leave", response_model=MessageResponse)
async def leave_call(
    call_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = CallService(db)
    try:
        await service.leave_call(user, uuid.UUID(call_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"calls.{e}", lang))
    return MessageResponse(message=t("calls.left", lang))


@router.post("/{call_id}/recording/start", response_model=RecordingResponse)
async def start_recording(
    call_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = CallService(db)
    try:
        data = await service.start_recording(user, uuid.UUID(call_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"calls.{e}", lang))
    return RecordingResponse(
        id=data["id"],
        call_id=data["call_id"],
        storage_url=None,
        file_size=None,
        duration_seconds=None,
        started_at=data["started_at"],
        ended_at=None,
    )


@router.post("/{call_id}/recording/stop", response_model=RecordingResponse)
async def stop_recording(
    call_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    duration_seconds: int | None = Form(None),
    file: UploadFile | None = File(None),
):
    lang = _lang(request)
    service = CallService(db)
    content = None
    content_type = None
    if file and file.filename:
        content = await file.read()
        content_type = file.content_type or "video/webm"
    try:
        data = await service.stop_recording(
            user, uuid.UUID(call_id), content, content_type, duration_seconds
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"calls.{e}", lang))
    return RecordingResponse(**data)
