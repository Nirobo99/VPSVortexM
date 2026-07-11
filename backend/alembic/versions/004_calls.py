"""calls stage 4

Revision ID: 004_calls
Revises: 003_messaging
Create Date: 2026-06-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004_calls"
down_revision: Union[str, None] = "003_messaging"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dialog_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("room_name", sa.String(128), nullable=False),
        sa.Column("call_type", sa.Enum("audio", "video", name="calltype"), nullable=False),
        sa.Column("status", sa.Enum("ringing", "active", "ended", name="callstatus"), nullable=False),
        sa.Column("initiator_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_group", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("max_participants", sa.Integer(), server_default="500", nullable=False),
        sa.Column("is_recording", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("recording_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["dialog_id"], ["dialogs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["initiator_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_dialog_id", "calls", ["dialog_id"])
    op.create_index("ix_calls_room_name", "calls", ["room_name"], unique=True)

    op.create_table(
        "call_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("call_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mask_face", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("mask_voice", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_call_participants_call_id", "call_participants", ["call_id"])
    op.create_index("ix_call_participants_user_id", "call_participants", ["user_id"])

    op.create_table(
        "call_recordings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("call_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("storage_url", sa.String(512), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("uploaded_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_call_recordings_call_id", "call_recordings", ["call_id"])


def downgrade() -> None:
    op.drop_table("call_recordings")
    op.drop_table("call_participants")
    op.drop_table("calls")
    op.execute("DROP TYPE IF EXISTS callstatus")
    op.execute("DROP TYPE IF EXISTS calltype")
