from datetime import datetime

from pydantic import BaseModel, Field


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class FolderUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    position: int | None = None


class FolderResponse(BaseModel):
    id: str
    name: str
    position: int
    created_at: str


class DialogCreateRequest(BaseModel):
    username: str | None = None
    user_id: str | None = None
    is_secret: bool = False
    auto_delete_seconds: int | None = Field(None, ge=60, le=604800)


class DialogParticipantInfo(BaseModel):
    id: str
    username: str
    display_name: str | None
    avatar_url: str | None
    e2e_public_key: str | None = None


class DialogListItem(BaseModel):
    id: str
    dialog_type: str
    is_secret: bool
    is_group: bool = False
    title: str | None = None
    member_count: int | None = None
    folder_id: str | None
    unread_count: int
    pinned_message_id: str | None
    auto_delete_seconds: int | None
    last_message_at: str | None
    other_user: DialogParticipantInfo | None
    last_message_preview: str | None


class DialogDetailResponse(BaseModel):
    id: str
    dialog_type: str
    is_secret: bool
    is_group: bool = False
    title: str | None = None
    member_count: int | None = None
    folder_id: str | None
    pinned_message_id: str | None
    auto_delete_seconds: int | None
    participants: list[DialogParticipantInfo]
    unread_count: int


class MoveDialogFolderRequest(BaseModel):
    folder_id: str | None = None


class E2EKeyRequest(BaseModel):
    public_key: str = Field(min_length=10)


class MessageSendRequest(BaseModel):
    message_type: str = "text"
    content: str | None = None
    content_e2e: str | None = None
    reply_to_id: str | None = None
    auto_delete_seconds: int | None = Field(None, ge=60, le=604800)


class MessageEditRequest(BaseModel):
    content: str | None = None
    content_e2e: str | None = None


class MessageReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


class MessageForwardRequest(BaseModel):
    dialog_ids: list[str] = Field(min_length=1, max_length=20)


class ReactionResponse(BaseModel):
    emoji: str
    user_id: str
    username: str


class ReplyPreview(BaseModel):
    id: str
    sender_id: str
    content_preview: str | None
    message_type: str
    is_deleted: bool


class MessageResponse(BaseModel):
    id: str
    dialog_id: str
    sender_id: str
    sender_username: str
    sender_display_name: str | None
    message_type: str
    content: str | None
    content_e2e: str | None
    media_url: str | None
    media_type: str | None
    file_name: str | None
    file_size: int | None
    reply_to: ReplyPreview | None
    forward_from_message_id: str | None
    is_edited: bool
    is_deleted: bool
    auto_delete_at: str | None
    reactions: list[ReactionResponse]
    created_at: str


class MessagesPageResponse(BaseModel):
    messages: list[MessageResponse]
    has_more: bool
    next_cursor: str | None


class SearchResultItem(BaseModel):
    message: MessageResponse
    dialog_id: str
    other_username: str | None


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    total: int
