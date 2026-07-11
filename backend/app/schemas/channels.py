from datetime import datetime

from pydantic import BaseModel, Field


class ChannelCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    description: str | None = Field(None, max_length=2000)
    visibility: str = "public"
    subscription_price: int = Field(0, ge=0)


class PostCreateRequest(BaseModel):
    post_type: str = "text"
    content: str | None = None
    is_paid: bool = False
    price: int = Field(0, ge=0)
    is_announcement: bool = False
    poll_options: list[str] | None = None
    quiz_correct_index: int | None = None
    event_starts_at: datetime | None = None
    event_location: str | None = None


class PollVoteRequest(BaseModel):
    option_id: str


class CommentCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class BroadcastRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    mention_all: bool = False


class MemberRoleRequest(BaseModel):
    user_id: str
    role: str
    can_post: bool | None = None
    can_edit: bool | None = None
    can_delete: bool | None = None
    can_ban: bool | None = None
    can_pin: bool | None = None
    can_announce: bool | None = None
    can_manage_members: bool | None = None


class ProductCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    price: int = Field(ge=1)
    description: str | None = None


class GroupCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    description: str | None = None
    members: list[str] = Field(default_factory=list)


class GroupAddMembersRequest(BaseModel):
    usernames: list[str] = Field(min_length=1)


class SetAdminRequest(BaseModel):
    user_id: str
    is_admin: bool


class ChannelResponse(BaseModel):
    id: str
    slug: str
    title: str
    description: str | None
    avatar_url: str | None
    owner_id: str
    visibility: str
    is_verified: bool
    subscriber_count: int
    subscription_price: int
    is_member: bool
    created_at: str


class PostResponse(BaseModel):
    id: str
    channel_id: str
    author_id: str
    author_username: str
    post_type: str
    content: str | None
    content_locked: bool
    price: int
    media_url: str | None
    media_type: str | None
    is_pinned: bool
    is_announcement: bool
    views_count: int
    poll_options: list[dict]
    event: dict | None
    reactions: list[dict]
    comments_count: int
    created_at: str


class GroupResponse(BaseModel):
    id: str
    title: str | None
    description: str | None
    avatar_url: str | None
    owner_id: str | None
    member_count: int
    member_limit: int
    is_paid_extended: bool
    created_at: str
