"""profile stage 2

Revision ID: 002_profile
Revises: 001_initial
Create Date: 2026-06-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002_profile"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("status_emoji", sa.String(16), nullable=True))
    op.add_column("users", sa.Column("anonymous_mask_face", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("anonymous_mask_voice", sa.Boolean(), server_default="false", nullable=False))

    op.create_table(
        "stories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_url", sa.String(512), nullable=True),
        sa.Column("media_type", sa.Enum("IMAGE", "VIDEO", "TEXT", name="storymediatype"), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stories_user_id", "stories", ["user_id"], unique=False)
    op.create_index("ix_stories_expires_at", "stories", ["expires_at"], unique=False)

    op.create_table(
        "achievements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("title_key", sa.String(128), nullable=False),
        sa.Column("description_key", sa.String(128), nullable=False),
        sa.Column("icon", sa.String(32), nullable=False),
        sa.Column("points_required", sa.Integer(), nullable=False),
        sa.Column("min_level", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_achievements_code", "achievements", ["code"], unique=True)

    op.create_table(
        "user_achievements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("achievement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["achievement_id"], ["achievements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
    )
    op.create_index("ix_user_achievements_user_id", "user_achievements", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_achievements_user_id", table_name="user_achievements")
    op.drop_table("user_achievements")
    op.drop_index("ix_achievements_code", table_name="achievements")
    op.drop_table("achievements")
    op.drop_index("ix_stories_expires_at", table_name="stories")
    op.drop_index("ix_stories_user_id", table_name="stories")
    op.drop_table("stories")
    op.drop_column("users", "anonymous_mask_voice")
    op.drop_column("users", "anonymous_mask_face")
    op.drop_column("users", "status_emoji")
    op.execute("DROP TYPE IF EXISTS storymediatype")
