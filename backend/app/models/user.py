import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"
    SUPERADMIN = "superadmin"


class ProfileVisibility(str, enum.Enum):
    PUBLIC = "public"
    PRIVATE = "private"


class ThemeMode(str, enum.Enum):
    LIGHT = "light"
    DARK = "dark"
    CUSTOM = "custom"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    birth_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    profile_visibility: Mapped[ProfileVisibility] = mapped_column(
        Enum(ProfileVisibility), default=ProfileVisibility.PUBLIC
    )
    theme_mode: Mapped[ThemeMode] = mapped_column(Enum(ThemeMode), default=ThemeMode.DARK)
    theme_primary: Mapped[str | None] = mapped_column(String(7), nullable=True)
    theme_accent: Mapped[str | None] = mapped_column(String(7), nullable=True)
    status_text: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status_emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    anonymous_mask_face: Mapped[bool] = mapped_column(Boolean, default=False)
    anonymous_mask_voice: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.USER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_official_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    activity_points: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    wallet_balance: Mapped[int] = mapped_column(Integer, default=0)
    vmoney_balance: Mapped[int] = mapped_column(Integer, default=0)
    referral_code: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True)
    referred_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    locale: Mapped[str] = mapped_column(String(5), default="ru")
    notify_messages: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_calls: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_channels: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_sound: Mapped[bool] = mapped_column(Boolean, default=True)
    chat_auto_clear_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chat_appearance: Mapped[str] = mapped_column(String(32), default="default")
    prefer_encrypted_chats: Mapped[bool] = mapped_column(Boolean, default=False)
    calls_audio_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    calls_video_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invisible_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invisible_fake_last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sticker_extra_slots: Mapped[int] = mapped_column(Integer, default=0)
    premium_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    username_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def is_superadmin(self) -> bool:
        return self.role == UserRole.SUPERADMIN
