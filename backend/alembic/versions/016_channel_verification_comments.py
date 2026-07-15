"""channel verification, profile post comments

Revision ID: 016_channel_verification_comments
Revises: 015_posts_and_public_groups
Create Date: 2026-07-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "016_channel_verification_comments"
down_revision: Union[str, None] = "015_posts_and_public_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Ensure wall table exists before FK from profile_post_comments.
    if not inspector.has_table("profile_posts"):
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
            sa.Column("media_type", sa.String(16), nullable=False, server_default="text"),
            sa.Column("text", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index("ix_profile_posts_user_id", "profile_posts", ["user_id"])
        inspector = sa.inspect(bind)

    if inspector.has_table("dialogs"):
        dialog_cols = {c["name"] for c in inspector.get_columns("dialogs")}
        if "is_public" not in dialog_cols:
            op.add_column(
                "dialogs",
                sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            )
            op.execute(
                sa.text("UPDATE dialogs SET is_public = true WHERE dialog_type::text ILIKE 'group'")
            )

    if not inspector.has_table("channel_verification_requests"):
        op.create_table(
            "channel_verification_requests",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("channel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("channels.id", ondelete="CASCADE"), nullable=False),
            sa.Column("requested_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("link_website", sa.String(512), nullable=True),
            sa.Column("link_social", sa.String(512), nullable=True),
            sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
            sa.Column("admin_note", sa.Text(), nullable=True),
            sa.Column("reviewed_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_channel_verification_requests_channel_id", "channel_verification_requests", ["channel_id"])
        op.create_index("ix_channel_verification_requests_status", "channel_verification_requests", ["status"])

    if not inspector.has_table("profile_post_comments"):
        op.create_table(
            "profile_post_comments",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("post_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profile_posts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_profile_post_comments_post_id", "profile_post_comments", ["post_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("profile_post_comments"):
        op.drop_index("ix_profile_post_comments_post_id", table_name="profile_post_comments")
        op.drop_table("profile_post_comments")
    if inspector.has_table("channel_verification_requests"):
        op.drop_index("ix_channel_verification_requests_status", table_name="channel_verification_requests")
        op.drop_index("ix_channel_verification_requests_channel_id", table_name="channel_verification_requests")
        op.drop_table("channel_verification_requests")
