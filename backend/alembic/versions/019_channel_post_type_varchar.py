"""channel post_type enum to varchar

Revision ID: 019_channel_post_type_varchar
Revises: 018_group_member_bans
Create Date: 2026-07-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019_channel_post_type_varchar"
down_revision: Union[str, None] = "018_group_member_bans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'channel_posts'
                  AND column_name = 'post_type'
                  AND udt_name = 'posttype'
              ) THEN
                ALTER TABLE channel_posts ALTER COLUMN post_type DROP DEFAULT;
                ALTER TABLE channel_posts
                  ALTER COLUMN post_type TYPE varchar(16)
                  USING lower(post_type::text);
                ALTER TABLE channel_posts ALTER COLUMN post_type SET DEFAULT 'text';
                DROP TYPE IF EXISTS posttype;
              END IF;
            END $$;
            """
        )
    )


def downgrade() -> None:
    pass
