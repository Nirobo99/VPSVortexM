import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StoryMediaType(str, enum.Enum):
    IMAGE = "image"
    VIDEO = "video"
    TEXT = "text"


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    media_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    media_type: Mapped[StoryMediaType] = mapped_column(Enum(StoryMediaType), default=StoryMediaType.TEXT)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProfilePostMediaType(str, enum.Enum):
    TEXT = "text"
    IMAGE = "image"


class ProfilePost(Base):
    """Permanent wall posts/photos on a user profile."""

    __tablename__ = "profile_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    media_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    media_type: Mapped[ProfilePostMediaType] = mapped_column(
        Enum(ProfilePostMediaType), default=ProfilePostMediaType.TEXT
    )
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title_key: Mapped[str] = mapped_column(String(128))
    description_key: Mapped[str] = mapped_column(String(128))
    icon: Mapped[str] = mapped_column(String(32), default="🏆")
    points_required: Mapped[int] = mapped_column(Integer, default=0)
    min_level: Mapped[int] = mapped_column(Integer, default=1)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    achievement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("achievements.id", ondelete="CASCADE")
    )
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VerificationApplicantType(str, enum.Enum):
    INDIVIDUAL = "individual"
    ORGANIZATION = "organization"


class VerificationRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class VerificationRequest(Base):
    __tablename__ = "verification_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    applicant_type: Mapped[VerificationApplicantType] = mapped_column(Enum(VerificationApplicantType))
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    patronymic: Mapped[str | None] = mapped_column(String(128), nullable=True)
    birth_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    legal_entity_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    legal_inn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    legal_ogrn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    legal_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    link_vk_group: Mapped[str | None] = mapped_column(String(512), nullable=True)
    link_vk_page: Mapped[str | None] = mapped_column(String(512), nullable=True)
    link_instagram: Mapped[str | None] = mapped_column(String(512), nullable=True)
    link_telegram: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[VerificationRequestStatus] = mapped_column(
        Enum(VerificationRequestStatus), default=VerificationRequestStatus.PENDING, index=True
    )
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
