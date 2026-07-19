"""Add referral bonus tracking and backfill referral codes.

Revision ID: 023_referral_system
Revises: 022_sticker_marketplace
Create Date: 2026-07-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "023_referral_system"
down_revision: Union[str, None] = "022_sticker_marketplace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("referral_bonus_earned", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_table(
        "referral_bonuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("referrer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("referred_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purchase_amount", sa.Integer(), nullable=False),
        sa.Column("bonus_amount", sa.Integer(), nullable=False),
        sa.Column("purchase_type", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("referred_user_id", name="uq_referral_bonus_referred_user"),
    )
    op.create_index("ix_referral_bonuses_referrer_id", "referral_bonuses", ["referrer_id"])
    op.create_index("ix_referral_bonuses_referred_user_id", "referral_bonuses", ["referred_user_id"])

    # Backfill missing referral codes for existing users
    op.execute(
        sa.text(
            """
            UPDATE users
            SET referral_code = UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
            WHERE referral_code IS NULL OR referral_code = ''
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_referral_bonuses_referred_user_id", table_name="referral_bonuses")
    op.drop_index("ix_referral_bonuses_referrer_id", table_name="referral_bonuses")
    op.drop_table("referral_bonuses")
    op.drop_column("users", "referral_bonus_earned")
