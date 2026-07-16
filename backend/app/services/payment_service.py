import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.payments import PaymentStatus, TransactionType, WalletPayment, WalletTransaction
from app.models.user import User

settings = get_settings()

MIN_TOPUP = 10
MAX_TOPUP = 100_000
INVISIBLE_MONTHLY_PRICE = 199
# 2 ₽ = 1 V.Money
VMONEY_RUB_PER_UNIT = 2
MIN_CONVERT_RUB = 2
MAX_CONVERT_RUB = 100_000


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _vmoney(user: User) -> int:
        return int(getattr(user, "vmoney_balance", 0) or 0)

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
        raw_type = t.transaction_type
        type_value = raw_type.value if hasattr(raw_type, "value") else str(raw_type)
        return {
            "id": str(t.id),
            "amount": t.amount,
            "balance_after": t.balance_after,
            "transaction_type": type_value,
            "description": t.description,
            "created_at": t.created_at.isoformat() if t.created_at else "",
        }

    async def _ensure_vmoney_column(self) -> None:
        from sqlalchemy import text

        await self.db.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS vmoney_balance integer NOT NULL DEFAULT 0
                """
            )
        )
        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()

    async def get_balance(self, user: User) -> dict:
        try:
            await self.db.refresh(user)
        except Exception:
            await self.db.rollback()
            await self._ensure_vmoney_column()
            await self.db.refresh(user)
        return {
            "balance": int(user.wallet_balance or 0),
            "vmoney_balance": self._vmoney(user),
        }

    async def get_history(self, user: User, limit: int = 50) -> dict:
        try:
            await self.db.refresh(user)
        except Exception:
            await self.db.rollback()
            await self._ensure_vmoney_column()
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
            "balance": int(user.wallet_balance or 0),
            "vmoney_balance": self._vmoney(user),
            "payments": [self._payment_dict(p) for p in payments_result.scalars().all()],
            "transactions": [self._transaction_dict(t) for t in tx_result.scalars().all()],
        }

    async def convert_to_vmoney(self, user: User, rubles: int) -> dict:
        """Exchange rubles → V.Money at 2 ₽ = 1 VM. Amount must be even and ≥ 2."""
        from sqlalchemy import text

        if rubles < MIN_CONVERT_RUB or rubles > MAX_CONVERT_RUB:
            raise ValueError("invalid_amount")
        if rubles % VMONEY_RUB_PER_UNIT != 0:
            raise ValueError("amount_must_be_even")

        await self._ensure_vmoney_column()
        vmoney = rubles // VMONEY_RUB_PER_UNIT

        result = await self.db.execute(
            text(
                """
                UPDATE users
                SET wallet_balance = wallet_balance - :rubles,
                    vmoney_balance = COALESCE(vmoney_balance, 0) + :vmoney
                WHERE id = :uid
                  AND wallet_balance >= :rubles
                RETURNING wallet_balance, COALESCE(vmoney_balance, 0)
                """
            ),
            {"rubles": rubles, "vmoney": vmoney, "uid": user.id},
        )
        row = result.first()
        if not row:
            raise ValueError("insufficient_balance")

        new_balance = int(row[0])
        new_vmoney = int(row[1])

        self.db.add(
            WalletTransaction(
                user_id=user.id,
                amount=-rubles,
                balance_after=new_balance,
                transaction_type=TransactionType.SPEND.value,
                description=f"Convert to V.Money (+{vmoney} VM)",
            )
        )
        await self.db.commit()

        # Keep in-memory user in sync for this request.
        user.wallet_balance = new_balance
        try:
            user.vmoney_balance = new_vmoney
        except Exception:
            pass

        return {
            "balance": new_balance,
            "vmoney_balance": new_vmoney,
            "converted_rubles": rubles,
            "received_vmoney": vmoney,
            "rate": VMONEY_RUB_PER_UNIT,
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
            transaction_type=TransactionType.TOPUP.value,
            description=payment.description,
        )
        self.db.add(txn)
        await self.db.commit()

    async def transfer(self, sender: User, recipient_username: str, amount: int) -> dict:
        if amount < 1 or amount > 100_000:
            raise ValueError("invalid_amount")
        if recipient_username.lower() == sender.username.lower():
            raise ValueError("cannot_transfer_self")
        result = await self.db.execute(select(User).where(User.username == recipient_username))
        recipient = result.scalar_one_or_none()
        if not recipient:
            raise ValueError("user_not_found")
        if sender.wallet_balance < amount:
            raise ValueError("insufficient_balance")

        sender.wallet_balance -= amount
        recipient.wallet_balance += amount

        sender_txn = WalletTransaction(
            user_id=sender.id,
            amount=-amount,
            balance_after=sender.wallet_balance,
            transaction_type=TransactionType.SPEND.value,
            description=f"Перевод @{recipient.username}",
        )
        recipient_txn = WalletTransaction(
            user_id=recipient.id,
            amount=amount,
            balance_after=recipient.wallet_balance,
            transaction_type=TransactionType.TOPUP.value,
            description=f"Перевод от @{sender.username}",
        )
        self.db.add(sender_txn)
        self.db.add(recipient_txn)
        await self.db.commit()
        return {"balance": sender.wallet_balance, "recipient": recipient.username, "amount": amount}

    async def purchase_invisible(self, user: User, fake_last_seen: datetime | None = None) -> dict:
        price = INVISIBLE_MONTHLY_PRICE
        await self.db.refresh(user)
        if self._vmoney(user) < price:
            raise ValueError("insufficient_vmoney")
        user.vmoney_balance = self._vmoney(user) - price
        now = datetime.now(timezone.utc)
        base = user.invisible_until if user.invisible_until and user.invisible_until > now else now
        user.invisible_until = base + timedelta(days=30)
        if fake_last_seen:
            user.invisible_fake_last_seen = fake_last_seen
        txn = WalletTransaction(
            user_id=user.id,
            amount=-price,
            balance_after=user.wallet_balance,
            transaction_type=TransactionType.SPEND.value,
            description="Подписка «Невидимка» (30 дней, V.Money)",
        )
        self.db.add(txn)
        await self.db.commit()
        try:
            from app.services.support_notify_service import SupportNotifyService

            until = user.invisible_until.isoformat() if user.invisible_until else ""
            await SupportNotifyService(self.db).notify_purchase(
                user,
                "Подписка «Невидимка» на 30 дней",
                f"Действует до: {until}\nПродление: https://vortexm.ru/wallet",
            )
        except Exception:
            pass
        return {
            "balance": user.wallet_balance,
            "vmoney_balance": self._vmoney(user),
            "invisible_until": user.invisible_until.isoformat(),
            "invisible_fake_last_seen": user.invisible_fake_last_seen.isoformat() if user.invisible_fake_last_seen else None,
        }
