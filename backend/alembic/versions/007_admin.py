"""admin panel stage 7

Revision ID: 007_admin
Revises: 006_payments
Create Date: 2026-06-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007_admin"
down_revision: Union[str, None] = "006_payments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.Enum(
            "user_ban", "user_unban", "user_delete", "role_change", "user_verify",
            "channel_verify", "complaint_resolve", "settings_update",
            "announcement_create", "announcement_delete", "anonymous_create",
            name="adminaction",
        ), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=True),
        sa.Column("target_id", sa.String(64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_admin_logs_admin_id", "admin_logs", ["admin_id"])

    op.create_table(
        "complaints",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("reporter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_type", sa.Enum("user", "channel", "message", name="complainttargettype"), nullable=False),
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.Enum("pending", "resolved", "rejected", name="complaintstatus"), nullable=False, server_default="pending"),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("resolved_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_complaints_reporter_id", "complaints", ["reporter_id"])
    op.create_index("ix_complaints_target_id", "complaints", ["target_id"])

    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("registration_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("ip_lockout_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.execute(
        "INSERT INTO platform_settings (id, project_enabled, registration_enabled, ip_lockout_enabled) "
        "VALUES (1, true, true, true)"
    )

    op.create_table(
        "announcements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("announcements")
    op.drop_table("platform_settings")
    op.drop_table("complaints")
    op.drop_table("admin_logs")
    op.execute("DROP TYPE IF EXISTS complaintstatus")
    op.execute("DROP TYPE IF EXISTS complainttargettype")
    op.execute("DROP TYPE IF EXISTS adminaction")
