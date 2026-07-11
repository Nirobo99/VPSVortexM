import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CallStatus(str, enum.Enum):
    RINGING = "ringing"
    ACTIVE = "active"
    ENDED = "ended"


class CallType(str, enum.Enum):
    AUDIO = "audio"
    VIDEO = "video"


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dialog_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dialogs.id", ondelete="CASCADE"), index=True)
    room_name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    call_type: Mapped[CallType] = mapped_column(Enum(CallType), default=CallType.VIDEO)
    status: Mapped[CallStatus] = mapped_column(Enum(CallStatus), default=CallStatus.RINGING)
    initiator_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    is_group: Mapped[bool] = mapped_column(Boolean, default=False)
    max_participants: Mapped[int] = mapped_column(Integer, default=500)
    is_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    recording_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    participants: Mapped[list["CallParticipant"]] = relationship(back_populates="call", cascade="all, delete-orphan")
    recordings: Mapped[list["CallRecording"]] = relationship(back_populates="call", cascade="all, delete-orphan")


class CallParticipant(Base):
    __tablename__ = "call_participants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    call_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("calls.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mask_face: Mapped[bool] = mapped_column(Boolean, default=False)
    mask_voice: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    call: Mapped["Call"] = relationship(back_populates="participants")


class CallRecording(Base):
    __tablename__ = "call_recordings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    call_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("calls.id", ondelete="CASCADE"), index=True)
    storage_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    call: Mapped["Call"] = relationship(back_populates="recordings")
