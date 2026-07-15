from datetime import datetime

from pydantic import BaseModel, Field


class ChannelCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    description: str | None = Field(None, max_length=2000)
    visibility: str = "public"
    subscription_price: int = Field(0, ge=0)


class ChannelUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = Field(None, max_length=2000)
    visibility: str | None = None
    subscription_price: int | None = Field(None, ge=0)


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
    is_public: bool = True


class GroupUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    is_public: bool | None = None


class GroupAddMembersRequest(BaseModel):
    usernames: list[str] = Field(min_length=1)


class SetAdminRequest(BaseModel):
    user_id: str
    is_admin: bool


class TransferOwnershipRequest(BaseModel):
    user_id: str


class ChannelVerificationSubmitRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=4000)
    link_website: str | None = Field(None, max_length=512)
    link_social: str | None = Field(None, max_length=512)


class ChannelVerificationResponse(BaseModel):
    id: str
    channel_id: str
    channel_slug: str | None = None
    channel_title: str | None = None
    requested_by_id: str
    reason: str
    link_website: str | None = None
    link_social: str | None = None
    status: str
    admin_note: str | None = None
    reviewed_at: str | None = None
    created_at: str


class ChannelMemberResponse(BaseModel):
    user_id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    role: str
    is_official_verified: bool = False
    joined_at: str


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
    is_owner: bool = False
    my_role: str | None = None
    can_post: bool = False
    can_manage_members: bool = False
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
    my_vote_option_id: str | None = None
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
    is_public: bool = False
    is_member: bool = False
    is_owner: bool = False
    created_at: str
