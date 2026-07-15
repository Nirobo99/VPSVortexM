from pydantic import BaseModel, Field


class AdminStatsResponse(BaseModel):
    users_total: int
    users_active: int
    users_banned: int
    channels_total: int
    messages_total: int
    complaints_pending: int
    revenue_total: int


class AdminUserItem(BaseModel):
    id: str
    username: str
    email: str
    display_name: str | None
    role: str
    is_verified: bool
    is_official_verified: bool = False
    is_banned: bool
    is_active: bool
    wallet_balance: int
    created_at: str


class IPLogItem(BaseModel):
    ip_address: str
    action: str
    created_at: str


class AdminUserDetail(AdminUserItem):
    ip_logs: list[IPLogItem]


class AdminUserListResponse(BaseModel):
    users: list[AdminUserItem]
    total: int


class AdminUserUpdateRequest(BaseModel):
    role: str | None = None
    is_verified: bool | None = None
    is_official_verified: bool | None = None
    wallet_balance: int | None = Field(None, ge=0)


class AdminLogItem(BaseModel):
    id: str
    admin_username: str
    action: str
    target_type: str | None
    target_id: str | None
    description: str | None
    ip_address: str | None
    created_at: str


class ComplaintCreateRequest(BaseModel):
    target_type: str
    target_id: str
    reason: str = Field(min_length=5, max_length=2000)


class ComplaintItem(BaseModel):
    id: str
    reporter_username: str
    target_type: str
    target_id: str
    reason: str
    status: str
    admin_note: str | None
    created_at: str
    resolved_at: str | None


class ComplaintResolveRequest(BaseModel):
    status: str
    admin_note: str | None = None


class PlatformSettingsResponse(BaseModel):
    project_enabled: bool
    registration_enabled: bool
    ip_lockout_enabled: bool


class PlatformSettingsUpdateRequest(BaseModel):
    project_enabled: bool | None = None
    registration_enabled: bool | None = None
    ip_lockout_enabled: bool | None = None


class AnnouncementCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    content: str = Field(min_length=1)
    is_active: bool = True


class AnnouncementItem(BaseModel):
    id: str
    title: str
    content: str
    is_active: bool
    starts_at: str | None
    ends_at: str | None
    created_at: str


class AdminChannelItem(BaseModel):
    id: str
    slug: str
    title: str
    owner_username: str
    is_verified: bool
    subscriber_count: int
