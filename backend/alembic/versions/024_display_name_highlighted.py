"""Add display_name_highlighted flag for shimmer name effect.

Revision ID: 024_display_name_highlighted
Revises: 023_referral_system
Create Date: 2026-07-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "024_display_name_highlighted"
down_revision: Union[str, None] = "023_referral_system"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("display_name_highlighted", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "display_name_highlighted")
