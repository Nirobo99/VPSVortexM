"""repair verification schema if migration 012 partially applied

Revision ID: 013_repair_verification
Revises: 012_verification
Create Date: 2026-07-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "013_repair_verification"
down_revision: Union[str, None] = "012_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "is_official_verified" not in user_columns:
        op.add_column(
            "users",
            sa.Column("is_official_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )

    if inspector.has_table("verification_requests"):
        return

    op.create_table(
        "verification_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "applicant_type",
            sa.Enum("individual", "organization", name="verificationapplicanttype"),
            nullable=False,
        ),
        sa.Column("first_name", sa.String(128), nullable=True),
        sa.Column("last_name", sa.String(128), nullable=True),
        sa.Column("patronymic", sa.String(128), nullable=True),
        sa.Column("birth_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("legal_entity_name", sa.String(256), nullable=True),
        sa.Column("legal_inn", sa.String(32), nullable=True),
        sa.Column("legal_ogrn", sa.String(32), nullable=True),
        sa.Column("legal_address", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("link_vk_group", sa.String(512), nullable=True),
        sa.Column("link_vk_page", sa.String(512), nullable=True),
        sa.Column("link_instagram", sa.String(512), nullable=True),
        sa.Column("link_telegram", sa.String(512), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", name="verificationrequeststatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_verification_requests_user_id", "verification_requests", ["user_id"])
    op.create_index("ix_verification_requests_status", "verification_requests", ["status"])


def downgrade() -> None:
    pass
