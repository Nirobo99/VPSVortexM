import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.payments import PaymentStatus, TransactionType, WalletPayment, WalletTransaction
from app.models.user import User

settings = get_settings()

MIN_TOPUP = 10
MAX_TOPUP = 100_000


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _payment_dict(self, p: WalletPayment) -> dict:
        return {
            "id": str(p.id),
            "amount": p.amount,
            "status": p.status.value,
            "description": p.description,
            "created_at": p.created_at.isoformat() if p.created_at else "",
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
        }

    def _transaction_dict(self, t: WalletTransaction) -> dict:
        return {
            "id": str(t.id),
            "amount": t.amount,
            "balance_after": t.balance_after,
            "transaction_type": t.transaction_type.value,
            "description": t.description,
            "created_at": t.created_at.isoformat() if t.created_at else "",
        }

    async def get_balance(self, user: User) -> int:
        await self.db.refresh(user)
        return user.wallet_balance

    async def get_history(self, user: User, limit: int = 50) -> dict:
        await self.db.refresh(user)
        payments_result = await self.db.execute(
            select(WalletPayment)
            .where(WalletPayment.user_id == user.id)
            .order_by(WalletPayment.created_at.desc())
            .limit(limit)
        )
        tx_result = await self.db.execute(
            select(WalletTransaction)
            .where(WalletTransaction.user_id == user.id)
            .order_by(WalletTransaction.created_at.desc())
            .limit(limit)
        )
        return {
            "balance": user.wallet_balance,
            "payments": [self._payment_dict(p) for p in payments_result.scalars().all()],
            "transactions": [self._transaction_dict(t) for t in tx_result.scalars().all()],
        }

    async def get_payment(self, user: User, payment_id: uuid.UUID) -> WalletPayment:
        result = await self.db.execute(
            select(WalletPayment).where(WalletPayment.id == payment_id, WalletPayment.user_id == user.id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            raise ValueError("payment_not_found")
        return payment

    async def create_topup(self, user: User, amount: int) -> dict:
        if amount < MIN_TOPUP or amount > MAX_TOPUP:
            raise ValueError("invalid_amount")

        payment = WalletPayment(
            user_id=user.id,
            amount=amount,
            status=PaymentStatus.PENDING,
            description="Пополнение кошелька VortexM",
        )
        self.db.add(payment)
        await self.db.flush()

        if settings.yookassa_mock:
            await self._complete_payment(payment, user)
            return {
                "payment_id": str(payment.id),
                "confirmation_url": f"{settings.yookassa_return_url}?payment_id={payment.id}",
                "status": PaymentStatus.SUCCEEDED.value,
                "amount": amount,
            }

        yk_payment = await asyncio.to_thread(self._create_yookassa_payment, user, payment, amount)
        payment.yookassa_id = yk_payment["id"]
        await self.db.commit()
        await self.db.refresh(payment)

        return {
            "payment_id": str(payment.id),
            "confirmation_url": yk_payment.get("confirmation_url"),
            "status": PaymentStatus.PENDING.value,
            "amount": amount,
        }

    def _create_yookassa_payment(self, user: User, payment: WalletPayment, amount: int) -> dict:
        from yookassa import Configuration
        from yookassa import Payment as YooPayment

        Configuration.account_id = settings.yookassa_shop_id
        Configuration.secret_key = settings.yookassa_secret_key

        yk = YooPayment.create(
            {
                "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
                "confirmation": {"type": "redirect", "return_url": settings.yookassa_return_url},
                "capture": True,
                "description": f"Пополнение кошелька VortexM ({user.username})",
                "metadata": {"user_id": str(user.id), "payment_id": str(payment.id)},
            },
            idempotency_key=str(payment.id),
        )
        confirmation_url = None
        if yk.confirmation and hasattr(yk.confirmation, "confirmation_url"):
            confirmation_url = yk.confirmation.confirmation_url
        return {"id": yk.id, "confirmation_url": confirmation_url}

    async def confirm_payment(self, user: User, payment_id: uuid.UUID) -> dict:
        payment = await self.get_payment(user, payment_id)
        if payment.status == PaymentStatus.SUCCEEDED:
            await self.db.refresh(user)
            return {**self._payment_dict(payment), "balance": user.wallet_balance}

        if not settings.yookassa_mock and payment.yookassa_id:
            yk_status = await asyncio.to_thread(self._fetch_yookassa_status, payment.yookassa_id)
            if yk_status == "succeeded":
                await self._complete_payment(payment, user)

        await self.db.refresh(user)
        await self.db.refresh(payment)
        return {**self._payment_dict(payment), "balance": user.wallet_balance}

    def _fetch_yookassa_status(self, yookassa_id: str) -> str:
        from yookassa import Configuration
        from yookassa import Payment as YooPayment

        Configuration.account_id = settings.yookassa_shop_id
        Configuration.secret_key = settings.yookassa_secret_key
        yk = YooPayment.find_one(yookassa_id)
        return yk.status

    async def handle_webhook(self, event: dict) -> None:
        event_type = event.get("event")
        if event_type != "payment.succeeded":
            return

        obj = event.get("object") or {}
        yookassa_id = obj.get("id")
        if not yookassa_id:
            return

        result = await self.db.execute(select(WalletPayment).where(WalletPayment.yookassa_id == yookassa_id))
        payment = result.scalar_one_or_none()
        if not payment:
            metadata = obj.get("metadata") or {}
            internal_id = metadata.get("payment_id")
            if internal_id:
                result = await self.db.execute(
                    select(WalletPayment).where(WalletPayment.id == uuid.UUID(internal_id))
                )
                payment = result.scalar_one_or_none()

        if not payment or payment.status == PaymentStatus.SUCCEEDED:
            return

        user_result = await self.db.execute(select(User).where(User.id == payment.user_id))
        user = user_result.scalar_one()
        await self._complete_payment(payment, user)

    async def _complete_payment(self, payment: WalletPayment, user: User) -> None:
        if payment.status == PaymentStatus.SUCCEEDED:
            return

        payment.status = PaymentStatus.SUCCEEDED
        payment.completed_at = datetime.now(timezone.utc)
        user.wallet_balance += payment.amount

        txn = WalletTransaction(
            user_id=user.id,
            payment_id=payment.id,
            amount=payment.amount,
            balance_after=user.wallet_balance,
            transaction_type=TransactionType.TOPUP,
            description=payment.description,
        )
        self.db.add(txn)
        await self.db.commit()
