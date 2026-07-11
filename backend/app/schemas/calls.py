from datetime import datetime, timezone

from pydantic import BaseModel


class CallCreateRequest(BaseModel):
    dialog_id: str
    call_type: str = "video"
    is_group: bool = False


class CallParticipantResponse(BaseModel):
    user_id: str
    username: str
    display_name: str | None
    avatar_url: str | None
    mask_face: bool
    mask_voice: bool
    joined_at: str | None


class CallResponse(BaseModel):
    id: str
    dialog_id: str
    room_name: str
    call_type: str
    status: str
    initiator_id: str
    is_group: bool
    max_participants: int
    is_recording: bool
    recording_started_at: str | None
    started_at: str | None
    ended_at: str | None
    created_at: str
    participants: list[CallParticipantResponse]


class JoinCallResponse(BaseModel):
    token: str
    livekit_url: str
    room_name: str
    call: CallResponse


class RecordingResponse(BaseModel):
    id: str
    call_id: str
    storage_url: str | None
    file_size: int | None
    duration_seconds: int | None
    started_at: str
    ended_at: str | None
