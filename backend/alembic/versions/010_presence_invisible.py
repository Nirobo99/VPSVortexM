"""presence invisible hidden dialogs

Revision ID: 010_presence_invisible
Revises: 009_security_hardening
Create Date: 2026-06-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_presence_invisible"
down_revision: Union[str, None] = "009_security_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("invisible_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("invisible_fake_last_seen", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("username_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "dialog_participants",
        sa.Column("is_hidden", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("dialog_participants", "is_hidden")
    op.drop_column("users", "username_changed_at")
    op.drop_column("users", "invisible_fake_last_seen")
    op.drop_column("users", "invisible_until")
    op.drop_column("users", "last_seen_at")
