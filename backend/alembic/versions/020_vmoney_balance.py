"""add users.vmoney_balance

Revision ID: 020_vmoney_balance
Revises: 019_channel_post_type_varchar
Create Date: 2026-07-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020_vmoney_balance"
down_revision: Union[str, None] = "019_channel_post_type_varchar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("users"):
        return
    cols = {c["name"] for c in inspector.get_columns("users")}
    if "vmoney_balance" not in cols:
        op.add_column(
            "users",
            sa.Column("vmoney_balance", sa.Integer(), server_default="0", nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("users"):
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "vmoney_balance" in cols:
            op.drop_column("users", "vmoney_balance")
