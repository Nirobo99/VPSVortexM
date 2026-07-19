"""Add sticker marketplace tables and related columns.

Revision ID: 022_sticker_marketplace
Revises: 021_wallet_tx_type_varchar
Create Date: 2026-07-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "022_sticker_marketplace"
down_revision: Union[str, None] = "021_wallet_tx_type_varchar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$ BEGIN
              CREATE TYPE moderationstatus AS ENUM ('pending', 'approved', 'rejected', 'draft');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
            """
        )
    )
    op.create_table(
        "sticker_packs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("creator_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("is_official", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("cover_image_url", sa.String(512), nullable=True),
        sa.Column("purchase_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("creator_id", "name", name="uq_sticker_pack_creator_name"),
    )
    op.create_index("ix_sticker_packs_creator_id", "sticker_packs", ["creator_id"])

    op.create_table(
        "stickers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("pack_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sticker_packs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_url", sa.String(512), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_stickers_pack_id", "stickers", ["pack_id"])

    op.create_table(
        "user_sticker_packs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pack_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sticker_packs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purchased_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "pack_id", name="uq_user_sticker_pack"),
    )
    op.create_index("ix_user_sticker_packs_user_id", "user_sticker_packs", ["user_id"])
    op.create_index("ix_user_sticker_packs_pack_id", "user_sticker_packs", ["pack_id"])

    op.create_table(
        "sticker_pack_moderations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("pack_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sticker_packs.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column(
            "status",
            postgresql.ENUM("pending", "approved", "rejected", "draft", name="moderationstatus", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )

    op.execute(
        sa.text(
            """
            DO $$ BEGIN
              ALTER TABLE users ADD COLUMN IF NOT EXISTS sticker_extra_slots integer NOT NULL DEFAULT 0;
              ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until timestamptz;
            EXCEPTION WHEN others THEN NULL;
            END $$;
            """
        )
    )
    op.execute(
        sa.text(
            """
            DO $$ BEGIN
              ALTER TABLE wallet_transactions
                ALTER COLUMN transaction_type TYPE varchar(32);
            EXCEPTION WHEN others THEN NULL;
            END $$;
            """
        )
    )
    op.execute(
        sa.text(
            """
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'messagetype') THEN
                ALTER TYPE messagetype ADD VALUE IF NOT EXISTS 'sticker';
              END IF;
            EXCEPTION WHEN others THEN NULL;
            END $$;
            """
        )
    )


def downgrade() -> None:
    op.drop_table("sticker_pack_moderations")
    op.drop_table("user_sticker_packs")
    op.drop_table("stickers")
    op.drop_table("sticker_packs")
    op.execute(sa.text("DROP TYPE IF EXISTS moderationstatus"))
