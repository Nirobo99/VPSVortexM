"""user notification and personal chat settings

Revision ID: 017_user_notification_chat_settings
Revises: 016_channel_verification_comments
Create Date: 2026-07-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017_user_notification_chat_settings"
down_revision: Union[str, None] = "016_channel_verification_comments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_COLUMNS = [
    ("notify_messages", sa.Boolean(), True),
    ("notify_calls", sa.Boolean(), True),
    ("notify_channels", sa.Boolean(), True),
    ("notify_sound", sa.Boolean(), True),
    ("chat_auto_clear_hours", sa.Integer(), None),
    ("chat_appearance", sa.String(32), "default"),
    ("prefer_encrypted_chats", sa.Boolean(), False),
    ("calls_audio_enabled", sa.Boolean(), True),
    ("calls_video_enabled", sa.Boolean(), True),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("users"):
        return
    existing = {c["name"] for c in inspector.get_columns("users")}
    for name, col_type, default in _COLUMNS:
        if name in existing:
            continue
        kwargs: dict = {"nullable": False if default is not None else True}
        if default is not None:
            if isinstance(default, bool):
                kwargs["server_default"] = sa.text("true" if default else "false")
            else:
                kwargs["server_default"] = sa.text(f"'{default}'")
        op.add_column("users", sa.Column(name, col_type, **kwargs))
        if default is not None and not isinstance(default, bool):
            # keep server_default for string; bool already set
            pass


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("users"):
        return
    existing = {c["name"] for c in inspector.get_columns("users")}
    for name, _, _ in _COLUMNS:
        if name in existing:
            op.drop_column("users", name)
