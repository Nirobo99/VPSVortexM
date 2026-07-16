"""wallet transaction_type enum to varchar

Revision ID: 021_wallet_tx_type_varchar
Revises: 020_vmoney_balance
Create Date: 2026-07-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021_wallet_tx_type_varchar"
down_revision: Union[str, None] = "020_vmoney_balance"
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
                WHERE table_name = 'wallet_transactions'
                  AND column_name = 'transaction_type'
                  AND udt_name = 'transactiontype'
              ) THEN
                ALTER TABLE wallet_transactions ALTER COLUMN transaction_type DROP DEFAULT;
                ALTER TABLE wallet_transactions
                  ALTER COLUMN transaction_type TYPE varchar(16)
                  USING lower(transaction_type::text);
              END IF;

              IF EXISTS (
                SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
              ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'vmoney_balance'
              ) THEN
                ALTER TABLE users
                  ADD COLUMN vmoney_balance integer NOT NULL DEFAULT 0;
              END IF;
            END $$;
            """
        )
    )


def downgrade() -> None:
    pass
