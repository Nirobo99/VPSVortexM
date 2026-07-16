"""group member timed bans

Revision ID: 018_group_member_bans
Revises: 017_user_notification_chat_settings
Create Date: 2026-07-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018_group_member_bans"
down_revision: Union[str, None] = "017_user_notification_chat_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("dialog_participants"):
        return
    cols = {c["name"] for c in inspector.get_columns("dialog_participants")}
    if "ban_reason" not in cols:
        op.add_column("dialog_participants", sa.Column("ban_reason", sa.String(32), nullable=True))
    if "banned_until" not in cols:
        op.add_column(
            "dialog_participants",
            sa.Column("banned_until", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("dialog_participants"):
        return
    cols = {c["name"] for c in inspector.get_columns("dialog_participants")}
    if "banned_until" in cols:
        op.drop_column("dialog_participants", "banned_until")
    if "ban_reason" in cols:
        op.drop_column("dialog_participants", "ban_reason")
