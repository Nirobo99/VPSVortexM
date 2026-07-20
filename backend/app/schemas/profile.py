from datetime import datetime

from pydantic import BaseModel, Field, field_validator
import re


class UsernameChangeRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)


class InvisibleSettingsRequest(BaseModel):
    fake_last_seen: datetime | None = None


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(None, max_length=128)
    bio: str | None = Field(None, max_length=2000)
    birth_date: datetime | None = None
    profile_visibility: str | None = None
    locale: str | None = Field(None, max_length=5)
    notify_messages: bool | None = None
    notify_calls: bool | None = None
    notify_channels: bool | None = None
    notify_sound: bool | None = None
    chat_auto_clear_hours: int | None = None
    chat_appearance: str | None = Field(None, max_length=32)
    prefer_encrypted_chats: bool | None = None
    calls_audio_enabled: bool | None = None
    calls_video_enabled: bool | None = None

    @field_validator("chat_auto_clear_hours")
    @classmethod
    def validate_auto_clear(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v not in (24, 48, 72, 168):
            raise ValueError("chat_auto_clear_hours must be 24, 48, 72, or 168")
        return v

    @field_validator("chat_appearance")
    @classmethod
    def validate_appearance(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"default", "compact", "bubbles"}
        if v not in allowed:
            raise ValueError("invalid chat_appearance")
        return v


class ThemeUpdateRequest(BaseModel):
    theme_mode: str | None = None
    theme_primary: str | None = Field(None, max_length=7)
    theme_accent: str | None = Field(None, max_length=7)

    @field_validator("theme_primary", "theme_accent")
    @classmethod
    def validate_hex(cls, v: str | None) -> str | None:
        if v is not None and not re.match(r"^#[0-9A-Fa-f]{6}$", v):
            raise ValueError("Invalid hex color")
        return v


class StatusUpdateRequest(BaseModel):
    status_text: str | None = Field(None, max_length=256)
    status_emoji: str | None = Field(None, max_length=16)


class VerificationSubmitRequest(BaseModel):
    applicant_type: str = Field(pattern="^(individual|organization)$")
    first_name: str | None = Field(None, max_length=128)
    last_name: str | None = Field(None, max_length=128)
    patronymic: str | None = Field(None, max_length=128)
    birth_date: datetime | None = None
    legal_entity_name: str | None = Field(None, max_length=256)
    legal_inn: str | None = Field(None, max_length=32)
    legal_ogrn: str | None = Field(None, max_length=32)
    legal_address: str | None = Field(None, max_length=2000)
    reason: str = Field(min_length=20, max_length=4000)
    link_vk_group: str | None = Field(None, max_length=512)
    link_vk_page: str | None = Field(None, max_length=512)
    link_instagram: str | None = Field(None, max_length=512)
    link_telegram: str | None = Field(None, max_length=512)


class VerificationRequestResponse(BaseModel):
    id: str
    user_id: str
    username: str | None = None
    applicant_type: str
    first_name: str | None
    last_name: str | None
    patronymic: str | None
    birth_date: str | None
    legal_entity_name: str | None
    legal_inn: str | None
    legal_ogrn: str | None
    legal_address: str | None
    reason: str
    link_vk_group: str | None
    link_vk_page: str | None
    link_instagram: str | None
    link_telegram: str | None
    status: str
    admin_note: str | None
    reviewed_at: str | None
    created_at: str | None


class VerificationReviewRequest(BaseModel):
    approve: bool
    admin_note: str | None = Field(None, max_length=2000)


class BlockUserRequest(BaseModel):
    user_id: str


class StoryCreateResponse(BaseModel):
    id: str
    media_url: str | None
    media_type: str
    text: str | None
    expires_at: str
    created_at: str


class ProfilePostResponse(BaseModel):
    id: str
    media_url: str | None
    media_type: str
    text: str | None
    comments_count: int = 0
    created_at: str


class ProfilePostCommentResponse(BaseModel):
    id: str
    post_id: str
    author_id: str
    author_username: str
    author_display_name: str | None = None
    author_avatar_url: str | None = None
    is_official_verified: bool = False
    content: str
    created_at: str


class ProfileResponse(BaseModel):
    id: str
    username: str
    email: str | None = None
    display_name: str | None
    avatar_url: str | None
    bio: str | None
    birth_date: str | None
    profile_visibility: str
    theme_mode: str
    theme_primary: str | None
    theme_accent: str | None
    status_text: str | None
    status_emoji: str | None
    is_verified: bool
    is_official_verified: bool = False
    display_name_highlighted: bool = False
    is_anonymous: bool
    anonymous_mask_face: bool
    anonymous_mask_voice: bool
    activity_points: int
    level: int
    locale: str
    role: str
    invisible_until: str | None = None
    invisible_fake_last_seen: str | None = None
    notify_messages: bool = True
    notify_calls: bool = True
    notify_channels: bool = True
    notify_sound: bool = True
    chat_auto_clear_hours: int | None = None
    chat_appearance: str = "default"
    prefer_encrypted_chats: bool = False
    calls_audio_enabled: bool = True
    calls_video_enabled: bool = True


class PublicProfileResponse(BaseModel):
    id: str
    username: str
    display_name: str | None
    avatar_url: str | None
    bio: str | None = None
    status_text: str | None
    status_emoji: str | None
    is_verified: bool
    is_official_verified: bool = False
    display_name_highlighted: bool = False
    is_admin: bool = False
    is_anonymous: bool
    profile_visibility: str


class GamificationResponse(BaseModel):
    activity_points: int
    level: int
    next_level_at: int
    progress_percent: int
    achievements: list[dict]


class AnonymousUserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    display_name: str = Field(min_length=1, max_length=128)
    mask_face: bool = True
    mask_voice: bool = True
