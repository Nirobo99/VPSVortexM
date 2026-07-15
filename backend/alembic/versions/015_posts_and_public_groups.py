"""fix profile post media_type and add public groups

Revision ID: 015_posts_and_public_groups
Revises: 014_repair_profile_posts
Create Date: 2026-07-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_posts_and_public_groups"
down_revision: Union[str, None] = "014_repair_profile_posts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert PG enum profilepostmediatype -> varchar to stop TEXT/text insert failures.
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'profile_posts'
                  AND column_name = 'media_type'
                  AND udt_name = 'profilepostmediatype'
              ) THEN
                ALTER TABLE profile_posts ALTER COLUMN media_type DROP DEFAULT;
                ALTER TABLE profile_posts
                  ALTER COLUMN media_type TYPE varchar(16)
                  USING media_type::text;
                ALTER TABLE profile_posts ALTER COLUMN media_type SET DEFAULT 'text';
                DROP TYPE IF EXISTS profilepostmediatype;
              END IF;
            END $$;
            """
        )
    )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("dialogs"):
        dialog_cols = {c["name"] for c in inspector.get_columns("dialogs")}
        if "is_public" not in dialog_cols:
            op.add_column(
                "dialogs",
                sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            )
            op.execute(
                sa.text("UPDATE dialogs SET is_public = true WHERE dialog_type::text = 'group'")
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("dialogs"):
        dialog_cols = {c["name"] for c in inspector.get_columns("dialogs")}
        if "is_public" in dialog_cols:
            op.drop_column("dialogs", "is_public")
