"""security hardening foundations

Revision ID: 009_security_hardening
Revises: 008_admin_rbac
Create Date: 2026-06-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "009_security_hardening"
down_revision: Union[str, None] = "008_admin_rbac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("encrypted_content", sa.LargeBinary(), nullable=True))

    op.create_table(
        "security_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("target_type", sa.String(length=64), nullable=True),
        sa.Column("target_id", sa.String(length=128), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_security_logs_event_type", "security_logs", ["event_type"])
    op.create_index("ix_security_logs_actor_user_id", "security_logs", ["actor_user_id"])
    op.create_index("ix_security_logs_created_at", "security_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_security_logs_created_at", table_name="security_logs")
    op.drop_index("ix_security_logs_actor_user_id", table_name="security_logs")
    op.drop_index("ix_security_logs_event_type", table_name="security_logs")
    op.drop_table("security_logs")
    op.drop_column("messages", "encrypted_content")
