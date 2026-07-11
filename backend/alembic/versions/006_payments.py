"""wallet payments stage 6

Revision ID: 006_payments
Revises: 005_channels
Create Date: 2026-06-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006_payments"
down_revision: Union[str, None] = "005_channels"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wallet_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.Enum("pending", "succeeded", "canceled", name="paymentstatus"), nullable=False, server_default="pending"),
        sa.Column("yookassa_id", sa.String(64), nullable=True),
        sa.Column("description", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_wallet_payments_user_id", "wallet_payments", ["user_id"])
    op.create_index("ix_wallet_payments_yookassa_id", "wallet_payments", ["yookassa_id"], unique=True)

    op.create_table(
        "wallet_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("wallet_payments.id"), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("transaction_type", sa.Enum("topup", "spend", "refund", name="transactiontype"), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_wallet_transactions_user_id", "wallet_transactions", ["user_id"])


def downgrade() -> None:
    op.drop_table("wallet_transactions")
    op.drop_table("wallet_payments")
    op.execute("DROP TYPE IF EXISTS transactiontype")
    op.execute("DROP TYPE IF EXISTS paymentstatus")
