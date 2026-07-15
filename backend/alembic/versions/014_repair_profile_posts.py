"""repair profile_posts table if missing

Revision ID: 014_repair_profile_posts
Revises: 013_repair_verification
Create Date: 2026-07-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "014_repair_profile_posts"
down_revision: Union[str, None] = "013_repair_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("profile_posts"):
        return

    op.create_table(
        "profile_posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("media_url", sa.String(512), nullable=True),
        sa.Column(
            "media_type",
            sa.Enum("text", "image", name="profilepostmediatype"),
            nullable=False,
            server_default="text",
        ),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_profile_posts_user_id", "profile_posts", ["user_id"])


def downgrade() -> None:
    pass
