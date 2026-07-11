from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    email: str
    password: str
    totp_code: str | None = None
    captcha_token: str | None = None


class AdminTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    admin: dict


class AdminRefreshRequest(BaseModel):
    refresh_token: str | None = None


class AdminAccountCreateRequest(BaseModel):
    email: str
    role: str
    permissions: dict | None = None


class AdminAccountUpdateRequest(BaseModel):
    role: str | None = None
    permissions: dict | None = None
    is_active: bool | None = None


class BulkBanRequest(BaseModel):
    user_ids: list[str]


class WalletAdjustRequest(BaseModel):
    amount: int
    reason: str = Field(min_length=3)


class AdBannerRequest(BaseModel):
    title: str
    image_url: str | None = None
    link_url: str | None = None
    target_locale: str | None = None
    target_region: str | None = None
    is_active: bool = True


class BroadcastCreateRequest(BaseModel):
    broadcast_type: str = "internal"
    subject: str | None = None
    body_html: str | None = None
    internal_text: str | None = None
    audience_filter: dict | None = None
    scheduled_at: str | None = None


class StaticPageUpdateRequest(BaseModel):
    title: str
    content_html: str


class PlatformSettingsFullUpdate(BaseModel):
    project_enabled: bool | None = None
    registration_enabled: bool | None = None
    ip_lockout_enabled: bool | None = None
    project_name: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    prices: dict | None = None
    allowed_admin_ips: list[str] | None = None
    backup_schedule_cron: str | None = None


class TotpEnableRequest(BaseModel):
    code: str
