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
    is_anonymous: bool
    anonymous_mask_face: bool
    anonymous_mask_voice: bool
    activity_points: int
    level: int
    locale: str
    role: str
    invisible_until: str | None = None
    invisible_fake_last_seen: str | None = None


class PublicProfileResponse(BaseModel):
    id: str
    username: str
    display_name: str | None
    avatar_url: str | None
    bio: str | None = None
    status_text: str | None
    status_emoji: str | None
    is_verified: bool
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
