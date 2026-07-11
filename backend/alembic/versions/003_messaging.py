"""messaging stage 3

Revision ID: 003_messaging
Revises: 002_profile
Create Date: 2026-06-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003_messaging"
down_revision: Union[str, None] = "002_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_folders_user_id", "chat_folders", ["user_id"])

    op.create_table(
        "dialogs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dialog_type", sa.Enum("direct", "secret", name="dialogtype"), nullable=False),
        sa.Column("direct_key", sa.String(80), nullable=True),
        sa.Column("auto_delete_seconds", sa.Integer(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dialogs_direct_key", "dialogs", ["direct_key"], unique=True)

    op.create_table(
        "dialog_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dialog_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pinned_message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("e2e_public_key", sa.Text(), nullable=True),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["dialog_id"], ["dialogs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["folder_id"], ["chat_folders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dialog_id", "user_id", name="uq_dialog_participant"),
    )
    op.create_index("ix_dialog_participants_dialog_id", "dialog_participants", ["dialog_id"])
    op.create_index("ix_dialog_participants_user_id", "dialog_participants", ["user_id"])

    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dialog_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sender_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message_type", sa.Enum("text", "voice", "video_note", "file", "system", name="messagetype"), nullable=False),
        sa.Column("content_encrypted", sa.Text(), nullable=True),
        sa.Column("content_e2e", sa.Text(), nullable=True),
        sa.Column("media_url", sa.String(512), nullable=True),
        sa.Column("media_type", sa.String(64), nullable=True),
        sa.Column("file_name", sa.String(255), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("reply_to_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("forward_from_message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("forward_from_dialog_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_edited", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_delete_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["dialog_id"], ["dialogs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reply_to_id"], ["messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messages_dialog_id", "messages", ["dialog_id"])
    op.create_index("ix_messages_sender_id", "messages", ["sender_id"])
    op.create_index("ix_messages_auto_delete_at", "messages", ["auto_delete_at"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])
    op.execute("CREATE INDEX ix_messages_search_vector ON messages USING GIN (search_vector)")

    op.create_table(
        "message_reactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("emoji", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "user_id", "emoji", name="uq_message_reaction"),
    )
    op.create_index("ix_message_reactions_message_id", "message_reactions", ["message_id"])


def downgrade() -> None:
    op.drop_table("message_reactions")
    op.execute("DROP INDEX IF EXISTS ix_messages_search_vector")
    op.drop_table("messages")
    op.drop_table("dialog_participants")
    op.drop_table("dialogs")
    op.drop_table("chat_folders")
    op.execute("DROP TYPE IF EXISTS messagetype")
    op.execute("DROP TYPE IF EXISTS dialogtype")
