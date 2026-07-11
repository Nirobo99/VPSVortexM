"""channels and groups stage 5

Revision ID: 005_channels
Revises: 004_calls
Create Date: 2026-06-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005_channels"
down_revision: Union[str, None] = "004_calls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE dialogtype ADD VALUE IF NOT EXISTS 'group'")

    op.add_column("dialogs", sa.Column("title", sa.String(128), nullable=True))
    op.add_column("dialogs", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("dialogs", sa.Column("avatar_url", sa.String(512), nullable=True))
    op.add_column("dialogs", sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("dialogs", sa.Column("member_limit", sa.Integer(), server_default="500", nullable=False))
    op.add_column("dialogs", sa.Column("is_paid_extended", sa.Boolean(), server_default="false", nullable=False))
    op.create_foreign_key("fk_dialogs_owner_id", "dialogs", "users", ["owner_id"], ["id"])

    op.add_column("dialog_participants", sa.Column("role", sa.String(32), server_default="member", nullable=False))
    op.add_column("dialog_participants", sa.Column("can_post", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("dialog_participants", sa.Column("can_invite", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("dialog_participants", sa.Column("can_moderate", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("dialog_participants", sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False))

    op.create_table(
        "channels",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("title", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.String(512), nullable=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("visibility", sa.Enum("public", "closed", name="channelvisibility"), nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("subscriber_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("subscription_price", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_channels_slug", "channels", ["slug"], unique=True)

    op.create_table(
        "channel_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.Enum("owner", "admin", "moderator", "subscriber", name="channelmemberrole"), nullable=False),
        sa.Column("can_post", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("can_edit", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("can_delete", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("can_ban", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("can_pin", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("can_announce", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("can_manage_members", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_subscriber_paid", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["channels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("channel_id", "user_id", name="uq_channel_member"),
    )

    op.create_table(
        "channel_posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_type", sa.Enum("text", "media", "poll", "quiz", "event", name="posttype"), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("media_url", sa.String(512), nullable=True),
        sa.Column("media_type", sa.String(64), nullable=True),
        sa.Column("is_paid", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("price", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_pinned", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_announcement", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("views_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["channel_id"], ["channels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "poll_options",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("text", sa.String(256), nullable=False),
        sa.Column("votes_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_correct", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["channel_posts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "poll_votes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("option_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["option_id"], ["poll_options.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["post_id"], ["channel_posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_poll_vote"),
    )

    op.create_table(
        "post_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("location", sa.String(256), nullable=True),
        sa.ForeignKeyConstraint(["post_id"], ["channel_posts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id"),
    )

    op.create_table(
        "post_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["post_id"], ["channel_posts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "post_reactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("emoji", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["channel_posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", "emoji", name="uq_post_reaction"),
    )

    op.create_table(
        "post_purchases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["channel_posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_post_purchase"),
    )

    op.create_table(
        "channel_products",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("image_url", sa.String(512), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["channels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "channel_broadcasts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("mention_all", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("sent_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["channel_id"], ["channels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("channel_broadcasts")
    op.drop_table("channel_products")
    op.drop_table("post_purchases")
    op.drop_table("post_reactions")
    op.drop_table("post_comments")
    op.drop_table("post_events")
    op.drop_table("poll_votes")
    op.drop_table("poll_options")
    op.drop_table("channel_posts")
    op.drop_table("channel_members")
    op.drop_table("channels")
    op.drop_column("dialog_participants", "is_admin")
    op.drop_column("dialog_participants", "can_moderate")
    op.drop_column("dialog_participants", "can_invite")
    op.drop_column("dialog_participants", "can_post")
    op.drop_column("dialog_participants", "role")
    op.drop_constraint("fk_dialogs_owner_id", "dialogs", type_="foreignkey")
    op.drop_column("dialogs", "is_paid_extended")
    op.drop_column("dialogs", "member_limit")
    op.drop_column("dialogs", "owner_id")
    op.drop_column("dialogs", "avatar_url")
    op.drop_column("dialogs", "description")
    op.drop_column("dialogs", "title")
    op.execute("DROP TYPE IF EXISTS posttype")
    op.execute("DROP TYPE IF EXISTS channelmemberrole")
    op.execute("DROP TYPE IF EXISTS channelvisibility")
