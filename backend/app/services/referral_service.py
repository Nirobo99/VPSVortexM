"""Referral program: codes, stats, and first-purchase V.Money bonuses."""

from __future__ import annotations

import secrets
import string
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.payments import WalletTransaction
from app.models.referral import ReferralBonus
from app.models.user import User

BONUS_RATE = Decimal("0.10")
TX_REFERRAL_BONUS = "referral_bonus"
CODE_ALPHABET = string.ascii_uppercase + string.digits


class ReferralService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def generate_code(length: int = 8) -> str:
        return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))

    async def ensure_unique_code(self) -> str:
        for _ in range(20):
            code = self.generate_code()
            exists = await self.db.execute(select(User.id).where(User.referral_code == code))
            if exists.scalar_one_or_none() is None:
                return code
        # Extremely unlikely fallback
        return uuid.uuid4().hex[:8].upper()

    @staticmethod
    def public_base_url() -> str:
        origins = get_settings().allowed_origins or "https://vortexm.ru"
        return origins.split(",")[0].strip().rstrip("/")

    def referral_link(self, code: str) -> str:
        return f"{self.public_base_url()}/ref/{code}"

    async def get_by_code(self, code: str) -> User | None:
        normalized = (code or "").strip().upper()
        if not normalized:
            return None
        result = await self.db.execute(
            select(User).where(func.upper(User.referral_code) == normalized)
        )
        return result.scalar_one_or_none()

    async def validate_code(self, code: str) -> dict:
        user = await self.get_by_code(code)
        if not user or user.is_banned:
            return {"valid": False, "referrer_username": None}
        return {"valid": True, "referrer_username": user.username}

    async def ensure_user_code(self, user: User) -> str:
        if user.referral_code:
            return user.referral_code
        user.referral_code = await self.ensure_unique_code()
        await self.db.flush()
        return user.referral_code

    async def get_info(self, user: User) -> dict:
        code = await self.ensure_user_code(user)
        invited = await self.db.execute(
            select(func.count()).select_from(User).where(User.referred_by_id == user.id)
        )
        purchased = await self.db.execute(
            select(func.count()).select_from(ReferralBonus).where(ReferralBonus.referrer_id == user.id)
        )
        earned = int(getattr(user, "referral_bonus_earned", 0) or 0)
        return {
            "referral_code": code,
            "referral_link": self.referral_link(code),
            "referral_count": int(invited.scalar() or 0),
            "purchased_count": int(purchased.scalar() or 0),
            "total_bonus_earned": earned,
        }

    async def list_referrals(self, user: User, page: int = 1, limit: int = 20) -> dict:
        page = max(1, page)
        limit = min(max(1, limit), 100)
        offset = (page - 1) * limit

        total_res = await self.db.execute(
            select(func.count()).select_from(User).where(User.referred_by_id == user.id)
        )
        total = int(total_res.scalar() or 0)

        rows = await self.db.execute(
            select(User)
            .where(User.referred_by_id == user.id)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        invitees = list(rows.scalars().all())
        invitee_ids = [u.id for u in invitees]

        bonuses: dict[uuid.UUID, ReferralBonus] = {}
        if invitee_ids:
            bonus_rows = await self.db.execute(
                select(ReferralBonus).where(
                    ReferralBonus.referrer_id == user.id,
                    ReferralBonus.referred_user_id.in_(invitee_ids),
                )
            )
            for b in bonus_rows.scalars().all():
                bonuses[b.referred_user_id] = b

        items = []
        for u in invitees:
            bonus = bonuses.get(u.id)
            items.append(
                {
                    "username": u.username,
                    "avatar_url": u.avatar_url,
                    "registered_at": u.created_at,
                    "has_purchased": bonus is not None,
                    "first_purchase_at": bonus.created_at if bonus else None,
                    "bonus_earned": int(bonus.bonus_amount) if bonus else 0,
                }
            )

        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "has_more": offset + len(items) < total,
        }

    async def process_first_purchase_bonus(
        self,
        buyer: User,
        purchase_amount: int,
        purchase_type: str = "purchase",
    ) -> int:
        """
        Credit referrer with 10% of the referred user's first paid purchase (V.Money).
        Safe to call multiple times — pays at most once per buyer.
        Does not commit; caller owns the transaction.
        """
        amount = int(purchase_amount or 0)
        if amount <= 0:
            return 0
        referrer_id = getattr(buyer, "referred_by_id", None)
        if not referrer_id:
            return 0
        if referrer_id == buyer.id:
            return 0

        existing = await self.db.execute(
            select(ReferralBonus.id).where(ReferralBonus.referred_user_id == buyer.id)
        )
        if existing.scalar_one_or_none():
            return 0

        bonus = int((Decimal(amount) * BONUS_RATE).quantize(Decimal("1")))
        if bonus <= 0:
            return 0

        referrer = await self.db.get(User, referrer_id)
        if not referrer or referrer.is_banned:
            return 0

        referrer.vmoney_balance = int(getattr(referrer, "vmoney_balance", 0) or 0) + bonus
        referrer.referral_bonus_earned = int(getattr(referrer, "referral_bonus_earned", 0) or 0) + bonus

        self.db.add(
            ReferralBonus(
                referrer_id=referrer.id,
                referred_user_id=buyer.id,
                purchase_amount=amount,
                bonus_amount=bonus,
                purchase_type=purchase_type,
            )
        )
        self.db.add(
            WalletTransaction(
                user_id=referrer.id,
                amount=bonus,
                balance_after=int(referrer.wallet_balance or 0),
                transaction_type=TX_REFERRAL_BONUS,
                description=f"Реферальный бонус 10% за первую покупку @{buyer.username}",
            )
        )
        await self.db.flush()
        return bonus
