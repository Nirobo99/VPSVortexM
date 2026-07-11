import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DialogType(str, enum.Enum):
    DIRECT = "direct"
    SECRET = "secret"
    GROUP = "group"


class MessageType(str, enum.Enum):
    TEXT = "text"
    VOICE = "voice"
    VIDEO_NOTE = "video_note"
    FILE = "file"
    SYSTEM = "system"


class ChatFolder(Base):
    __tablename__ = "chat_folders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Dialog(Base):
    __tablename__ = "dialogs"
    __table_args__ = (Index("ix_dialogs_direct_key", "direct_key", unique=True),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dialog_type: Mapped[DialogType] = mapped_column(Enum(DialogType), default=DialogType.DIRECT)
    direct_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    member_limit: Mapped[int] = mapped_column(Integer, default=500)
    is_paid_extended: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_delete_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    participants: Mapped[list["DialogParticipant"]] = relationship(back_populates="dialog", cascade="all, delete-orphan")
    messages: Mapped[list["Message"]] = relationship(back_populates="dialog", cascade="all, delete-orphan")


class DialogParticipant(Base):
    __tablename__ = "dialog_participants"
    __table_args__ = (UniqueConstraint("dialog_id", "user_id", name="uq_dialog_participant"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dialog_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dialogs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_folders.id", ondelete="SET NULL"), nullable=True
    )
    pinned_message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    e2e_public_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="member")
    can_post: Mapped[bool] = mapped_column(Boolean, default=True)
    can_invite: Mapped[bool] = mapped_column(Boolean, default=False)
    can_moderate: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dialog: Mapped["Dialog"] = relationship(back_populates="participants")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dialog_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dialogs.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    message_type: Mapped[MessageType] = mapped_column(Enum(MessageType), default=MessageType.TEXT)
    encrypted_content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    content_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_e2e: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    media_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reply_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
    )
    forward_from_message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    forward_from_dialog_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auto_delete_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    dialog: Mapped["Dialog"] = relationship(back_populates="messages")
    reactions: Mapped[list["MessageReaction"]] = relationship(back_populates="message", cascade="all, delete-orphan")


class MessageReaction(Base):
    __tablename__ = "message_reactions"
    __table_args__ = (UniqueConstraint("message_id", "user_id", "emoji", name="uq_message_reaction"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    message: Mapped["Message"] = relationship(back_populates="reactions")
    user: Mapped["User"] = relationship()
