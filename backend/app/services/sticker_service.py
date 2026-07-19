import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.payments import TransactionType, WalletTransaction
from app.models.sticker import (
    ModerationStatus,
    Sticker,
    StickerPack,
    StickerPackModeration,
    UserStickerPack,
)
from app.models.user import User
from app.services.storage_service import StorageService
from app.services.support_notify_service import SupportNotifyService

BASE_PACK_SLOTS = 20
PREMIUM_PACK_BONUS = 20
MIN_USER_PRICE = 10
MAX_USER_PRICE = 10000
MIN_STICKERS = 5
MAX_STICKERS = 30
COVER_MAX_BYTES = 1 * 1024 * 1024
STICKER_MAX_BYTES = 500 * 1024
ALLOWED_STICKER_TYPES = {"image/png", "image/webp"}
COMMISSION_RATE = Decimal("0.20")
TX_BUY = "sticker_pack_purchase"
TX_SALE = "sticker_pack_sale"
TX_FEE = "sticker_pack_fee"


class StickerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _price_int(price: Decimal | int | float | None) -> int:
        return int(Decimal(str(price or 0)))

    @staticmethod
    def _presign(url: str | None, days: int = 1) -> str | None:
        if not url:
            return None
        return StorageService.generate_presigned_url(url) or url

    def slot_limit(self, user: User) -> int | None:
        if getattr(user, "is_anonymous", False):
            return None
        limit = BASE_PACK_SLOTS
        premium_until = getattr(user, "premium_until", None)
        if premium_until and premium_until > datetime.now(timezone.utc):
            limit += PREMIUM_PACK_BONUS
        limit += int(getattr(user, "sticker_extra_slots", 0) or 0)
        return limit

    async def _counted_installed(self, user_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(UserStickerPack)
            .join(StickerPack, StickerPack.id == UserStickerPack.pack_id)
            .where(
                UserStickerPack.user_id == user_id,
                or_(StickerPack.is_official.is_(False), StickerPack.price > 0),
            )
        )
        return int(result.scalar() or 0)

    async def _owned(self, user_id: uuid.UUID, pack_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(UserStickerPack.id).where(
                UserStickerPack.user_id == user_id, UserStickerPack.pack_id == pack_id
            )
        )
        return result.scalar_one_or_none() is not None

    async def _pack_dict(
        self,
        pack: StickerPack,
        *,
        viewer: User | None = None,
        include_stickers: bool = False,
        preview: int = 0,
    ) -> dict:
        creator = None
        if pack.creator_id:
            creator = await self.db.get(User, pack.creator_id)
        stickers = list(pack.stickers or [])
        stickers.sort(key=lambda s: s.sort_order)
        mod = pack.moderation
        owned = False
        if viewer:
            owned = await self._owned(viewer.id, pack.id)
        preview_items = stickers[:preview] if preview else []
        full = stickers if include_stickers else []
        return {
            "id": str(pack.id),
            "name": pack.name,
            "description": pack.description,
            "price": float(pack.price or 0),
            "is_official": bool(pack.is_official),
            "is_active": bool(pack.is_active),
            "cover_image_url": self._presign(pack.cover_image_url, days=7),
            "purchase_count": int(pack.purchase_count or 0),
            "creator_id": str(pack.creator_id) if pack.creator_id else None,
            "creator_username": creator.username if creator else ("VortexM" if pack.is_official else None),
            "creator_display_name": (
                creator.display_name if creator else ("VortexM" if pack.is_official else None)
            ),
            "sticker_count": len(stickers),
            "owned": owned,
            "moderation_status": mod.status.value if mod else None,
            "rejection_reason": mod.rejection_reason if mod else None,
            "created_at": pack.created_at.isoformat() if pack.created_at else datetime.now(timezone.utc).isoformat(),
            "preview_stickers": [self._sticker_dict(s) for s in preview_items],
            "stickers": [self._sticker_dict(s) for s in full],
        }

    def _sticker_dict(self, sticker: Sticker) -> dict:
        return {
            "id": str(sticker.id),
            "pack_id": str(sticker.pack_id),
            "image_url": self._presign(sticker.image_url, days=1),
            "sort_order": sticker.sort_order,
            "created_at": sticker.created_at.isoformat() if sticker.created_at else "",
        }

    async def _get_pack(self, pack_id: uuid.UUID) -> StickerPack:
        result = await self.db.execute(
            select(StickerPack)
            .where(StickerPack.id == pack_id)
            .options(selectinload(StickerPack.stickers), selectinload(StickerPack.moderation))
        )
        pack = result.scalar_one_or_none()
        if not pack:
            raise ValueError("pack_not_found")
        return pack

    def _validate_image(self, content: bytes, content_type: str, max_bytes: int) -> None:
        if content_type not in ALLOWED_STICKER_TYPES:
            raise ValueError("invalid_image_type")
        if len(content) > max_bytes:
            raise ValueError("file_too_large")

    async def create_user_pack(
        self,
        user: User,
        name: str,
        description: str | None,
        price: Decimal,
        cover: tuple[bytes, str] | None,
        stickers: list[tuple[bytes, str]],
        submit: bool = True,
    ) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("invalid_name")
        price_i = self._price_int(price)
        if price_i < MIN_USER_PRICE or price_i > MAX_USER_PRICE:
            raise ValueError("invalid_price")
        if len(stickers) < MIN_STICKERS:
            raise ValueError("too_few_stickers")
        if len(stickers) > MAX_STICKERS:
            raise ValueError("too_many_stickers")

        pack = StickerPack(
            creator_id=user.id,
            name=name,
            description=(description or "").strip() or None,
            price=Decimal(price_i),
            is_official=False,
            is_active=False,
        )
        self.db.add(pack)
        await self.db.flush()

        if cover:
            self._validate_image(cover[0], cover[1], COVER_MAX_BYTES)
            pack.cover_image_url = StorageService.upload_file(
                cover[0], f"stickers/{pack.id}/cover/{uuid.uuid4()}.webp", cover[1]
            )

        for i, (data, ctype) in enumerate(stickers):
            self._validate_image(data, ctype, STICKER_MAX_BYTES)
            url = StorageService.upload_file(
                data, f"stickers/{pack.id}/{uuid.uuid4()}.webp", ctype
            )
            self.db.add(Sticker(pack_id=pack.id, image_url=url, sort_order=i))

        status = ModerationStatus.PENDING if submit else ModerationStatus.DRAFT
        self.db.add(StickerPackModeration(pack_id=pack.id, status=status))
        await self.db.commit()
        pack = await self._get_pack(pack.id)
        return await self._pack_dict(pack, viewer=user, include_stickers=True)

    async def list_my_created(self, user: User, status: str | None = None) -> list[dict]:
        result = await self.db.execute(
            select(StickerPack)
            .where(StickerPack.creator_id == user.id)
            .options(selectinload(StickerPack.stickers), selectinload(StickerPack.moderation))
            .order_by(StickerPack.created_at.desc())
        )
        out = []
        for pack in result.scalars().all():
            d = await self._pack_dict(pack, viewer=user, include_stickers=False, preview=4)
            if status and (d.get("moderation_status") or "") != status:
                continue
            out.append(d)
        return out

    async def update_user_pack(
        self,
        user: User,
        pack_id: uuid.UUID,
        name: str | None = None,
        description: str | None = None,
        price: Decimal | None = None,
        cover: tuple[bytes, str] | None = None,
        submit: bool = False,
    ) -> dict:
        pack = await self._get_pack(pack_id)
        if pack.creator_id != user.id or pack.is_official:
            raise ValueError("no_permission")
        mod = pack.moderation
        if mod and mod.status == ModerationStatus.APPROVED and pack.is_active:
            raise ValueError("cannot_edit_approved")
        if name is not None:
            cleaned = name.strip()
            if not cleaned:
                raise ValueError("invalid_name")
            pack.name = cleaned
        if description is not None:
            pack.description = description.strip() or None
        if price is not None:
            price_i = self._price_int(price)
            if price_i < MIN_USER_PRICE or price_i > MAX_USER_PRICE:
                raise ValueError("invalid_price")
            pack.price = Decimal(price_i)
        if cover:
            self._validate_image(cover[0], cover[1], COVER_MAX_BYTES)
            if pack.cover_image_url:
                try:
                    StorageService.delete_by_url(pack.cover_image_url)
                except Exception:
                    pass
            pack.cover_image_url = StorageService.upload_file(
                cover[0], f"stickers/{pack.id}/cover/{uuid.uuid4()}.webp", cover[1]
            )
        if submit:
            if len(pack.stickers or []) < MIN_STICKERS:
                raise ValueError("too_few_stickers")
            if not mod:
                mod = StickerPackModeration(pack_id=pack.id, status=ModerationStatus.PENDING)
                self.db.add(mod)
            else:
                mod.status = ModerationStatus.PENDING
                mod.rejection_reason = None
                mod.reviewed_at = None
                mod.reviewed_by = None
            pack.is_active = False
        await self.db.commit()
        pack = await self._get_pack(pack_id)
        return await self._pack_dict(pack, viewer=user, include_stickers=True)

    async def delete_user_pack(self, user: User, pack_id: uuid.UUID) -> None:
        pack = await self._get_pack(pack_id)
        if pack.creator_id != user.id and not pack.is_official:
            raise ValueError("no_permission")
        if pack.is_official:
            raise ValueError("no_permission")
        pack.is_active = False
        if pack.moderation:
            pack.moderation.status = ModerationStatus.REJECTED
            pack.moderation.rejection_reason = "Удалено автором"
        await self.db.commit()

    async def add_stickers(
        self, user: User, pack_id: uuid.UUID, files: list[tuple[bytes, str]]
    ) -> dict:
        pack = await self._get_pack(pack_id)
        if pack.creator_id != user.id:
            raise ValueError("no_permission")
        if pack.moderation and pack.moderation.status == ModerationStatus.APPROVED and pack.is_active:
            raise ValueError("cannot_edit_approved")
        current = len(pack.stickers or [])
        if current + len(files) > MAX_STICKERS:
            raise ValueError("too_many_stickers")
        start = current
        for i, (data, ctype) in enumerate(files):
            self._validate_image(data, ctype, STICKER_MAX_BYTES)
            url = StorageService.upload_file(
                data, f"stickers/{pack.id}/{uuid.uuid4()}.webp", ctype
            )
            self.db.add(Sticker(pack_id=pack.id, image_url=url, sort_order=start + i))
        await self.db.commit()
        pack = await self._get_pack(pack_id)
        return await self._pack_dict(pack, viewer=user, include_stickers=True)

    async def delete_sticker(self, user: User, pack_id: uuid.UUID, sticker_id: uuid.UUID) -> dict:
        pack = await self._get_pack(pack_id)
        if pack.creator_id != user.id:
            raise ValueError("no_permission")
        if pack.moderation and pack.moderation.status == ModerationStatus.APPROVED and pack.is_active:
            raise ValueError("cannot_edit_approved")
        sticker = next((s for s in pack.stickers if s.id == sticker_id), None)
        if not sticker:
            raise ValueError("sticker_not_found")
        try:
            StorageService.delete_by_url(sticker.image_url)
        except Exception:
            pass
        await self.db.delete(sticker)
        await self.db.commit()
        pack = await self._get_pack(pack_id)
        return await self._pack_dict(pack, viewer=user, include_stickers=True)

    async def reorder_stickers(
        self, user: User, pack_id: uuid.UUID, items: list[dict]
    ) -> dict:
        pack = await self._get_pack(pack_id)
        if pack.creator_id != user.id:
            raise ValueError("no_permission")
        by_id = {str(s.id): s for s in pack.stickers}
        for item in items:
            s = by_id.get(str(item.get("id")))
            if s:
                s.sort_order = int(item.get("sort_order") or 0)
        await self.db.commit()
        pack = await self._get_pack(pack_id)
        return await self._pack_dict(pack, viewer=user, include_stickers=True)

    async def marketplace(
        self,
        user: User | None,
        *,
        type_filter: str = "all",
        paid: str = "all",
        sort: str = "popular",
        search: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        page = max(1, page)
        limit = min(50, max(1, limit))
        q = (
            select(StickerPack)
            .where(StickerPack.is_active.is_(True))
            .options(selectinload(StickerPack.stickers), selectinload(StickerPack.moderation))
        )
        if type_filter == "official":
            q = q.where(StickerPack.is_official.is_(True))
        elif type_filter == "user":
            q = q.where(StickerPack.is_official.is_(False))
        if paid == "true":
            q = q.where(StickerPack.price > 0)
        elif paid == "false":
            q = q.where(StickerPack.price == 0)
        if search:
            like = f"%{search.strip()}%"
            q = q.where(or_(StickerPack.name.ilike(like), StickerPack.description.ilike(like)))
        if sort == "new":
            q = q.order_by(StickerPack.created_at.desc())
        elif sort == "price_asc":
            q = q.order_by(StickerPack.price.asc(), StickerPack.purchase_count.desc())
        elif sort == "price_desc":
            q = q.order_by(StickerPack.price.desc(), StickerPack.purchase_count.desc())
        else:
            q = q.order_by(StickerPack.purchase_count.desc(), StickerPack.created_at.desc())

        count_q = select(func.count()).select_from(StickerPack).where(StickerPack.is_active.is_(True))
        if type_filter == "official":
            count_q = count_q.where(StickerPack.is_official.is_(True))
        elif type_filter == "user":
            count_q = count_q.where(StickerPack.is_official.is_(False))
        if paid == "true":
            count_q = count_q.where(StickerPack.price > 0)
        elif paid == "false":
            count_q = count_q.where(StickerPack.price == 0)
        if search:
            like = f"%{search.strip()}%"
            count_q = count_q.where(or_(StickerPack.name.ilike(like), StickerPack.description.ilike(like)))
        total = int((await self.db.execute(count_q)).scalar() or 0)
        result = await self.db.execute(q.offset((page - 1) * limit).limit(limit))
        items = []
        for pack in result.scalars().unique().all():
            items.append(await self._pack_dict(pack, viewer=user, preview=6))
        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "has_more": page * limit < total,
        }

    async def pack_detail(self, user: User | None, pack_id: uuid.UUID) -> dict:
        pack = await self._get_pack(pack_id)
        if not pack.is_active and (not user or (pack.creator_id != user.id and not pack.is_official)):
            raise ValueError("pack_not_found")
        return await self._pack_dict(pack, viewer=user, include_stickers=True)

    async def buy_pack(self, user: User, pack_id: uuid.UUID) -> dict:
        pack = await self._get_pack(pack_id)
        if not pack.is_active:
            raise ValueError("pack_not_active")
        if await self._owned(user.id, pack.id):
            raise ValueError("already_owned")

        price = self._price_int(pack.price)
        if price == 0:
            await self._install(user, pack, count_slot=False)
            await self.db.commit()
            return await self._pack_dict(await self._get_pack(pack.id), viewer=user, include_stickers=True)

        limit = self.slot_limit(user)
        if limit is not None:
            used = await self._counted_installed(user.id)
            if used >= limit:
                raise ValueError("slot_limit_exceeded")

        vmoney = int(getattr(user, "vmoney_balance", 0) or 0)
        if vmoney < price:
            raise ValueError("insufficient_vmoney")

        user.vmoney_balance = vmoney - price
        self.db.add(
            WalletTransaction(
                user_id=user.id,
                amount=-price,
                balance_after=int(user.wallet_balance or 0),
                transaction_type=TX_BUY,
                description=f"Покупка стикерпака «{pack.name}»",
            )
        )

        seller_share = int(price * (Decimal("1") - COMMISSION_RATE))
        commission = price - seller_share
        if pack.creator_id and seller_share > 0:
            seller = await self.db.get(User, pack.creator_id)
            if seller:
                seller.vmoney_balance = int(getattr(seller, "vmoney_balance", 0) or 0) + seller_share
                self.db.add(
                    WalletTransaction(
                        user_id=seller.id,
                        amount=seller_share,
                        balance_after=int(seller.wallet_balance or 0),
                        transaction_type=TX_SALE,
                        description=f"Продажа стикерпака «{pack.name}»",
                    )
                )
        if commission > 0:
            platform = await SupportNotifyService.ensure_support_user(self.db)
            platform.vmoney_balance = int(getattr(platform, "vmoney_balance", 0) or 0) + commission
            self.db.add(
                WalletTransaction(
                    user_id=platform.id,
                    amount=commission,
                    balance_after=int(platform.wallet_balance or 0),
                    transaction_type=TX_FEE,
                    description=f"Комиссия маркетплейса: «{pack.name}»",
                )
            )

        pack.purchase_count = int(pack.purchase_count or 0) + 1
        self.db.add(UserStickerPack(user_id=user.id, pack_id=pack.id))
        await self.db.commit()
        return await self._pack_dict(await self._get_pack(pack.id), viewer=user, include_stickers=True)

    async def _install(self, user: User, pack: StickerPack, count_slot: bool = True) -> None:
        if await self._owned(user.id, pack.id):
            return
        if count_slot:
            is_free_official = pack.is_official and self._price_int(pack.price) == 0
            if not is_free_official:
                limit = self.slot_limit(user)
                if limit is not None:
                    used = await self._counted_installed(user.id)
                    if used >= limit:
                        raise ValueError("slot_limit_exceeded")
        self.db.add(UserStickerPack(user_id=user.id, pack_id=pack.id))
        if self._price_int(pack.price) == 0:
            pack.purchase_count = int(pack.purchase_count or 0) + 1

    async def install_free(self, user: User, pack_id: uuid.UUID) -> dict:
        pack = await self._get_pack(pack_id)
        if not pack.is_active:
            raise ValueError("pack_not_active")
        if self._price_int(pack.price) > 0:
            raise ValueError("pack_not_free")
        if await self._owned(user.id, pack.id):
            raise ValueError("already_owned")
        await self._install(user, pack, count_slot=not (pack.is_official and self._price_int(pack.price) == 0))
        await self.db.commit()
        return await self._pack_dict(await self._get_pack(pack.id), viewer=user, include_stickers=True)

    async def uninstall(self, user: User, pack_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(UserStickerPack).where(
                UserStickerPack.user_id == user.id, UserStickerPack.pack_id == pack_id
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            raise ValueError("not_installed")
        await self.db.delete(row)
        await self.db.commit()

    async def list_installed(self, user: User) -> dict:
        result = await self.db.execute(
            select(StickerPack)
            .join(UserStickerPack, UserStickerPack.pack_id == StickerPack.id)
            .where(UserStickerPack.user_id == user.id)
            .options(selectinload(StickerPack.stickers), selectinload(StickerPack.moderation))
            .order_by(UserStickerPack.purchased_at.desc())
        )
        packs = []
        for pack in result.scalars().unique().all():
            packs.append(await self._pack_dict(pack, viewer=user, include_stickers=True))
        used = await self._counted_installed(user.id)
        return {
            "packs": packs,
            "installed_count": len(packs),
            "slot_limit": self.slot_limit(user),
            "slots_used": used,
        }

    async def grant_official_free_packs(self, user: User) -> None:
        result = await self.db.execute(
            select(StickerPack).where(
                StickerPack.is_official.is_(True),
                StickerPack.is_active.is_(True),
                StickerPack.price == 0,
            )
        )
        for pack in result.scalars().all():
            if not await self._owned(user.id, pack.id):
                self.db.add(UserStickerPack(user_id=user.id, pack_id=pack.id))
        await self.db.commit()

    async def resolve_sticker_for_send(self, user: User, sticker_id: uuid.UUID) -> Sticker:
        result = await self.db.execute(
            select(Sticker)
            .where(Sticker.id == sticker_id)
            .options(selectinload(Sticker.pack))
        )
        sticker = result.scalar_one_or_none()
        if not sticker:
            raise ValueError("sticker_not_found")
        if not await self._owned(user.id, sticker.pack_id):
            raise ValueError("sticker_not_owned")
        return sticker

    # --- Admin ---

    async def list_moderation(self, status: str | None = None) -> list[dict]:
        q = (
            select(StickerPack)
            .where(StickerPack.is_official.is_(False))
            .options(selectinload(StickerPack.stickers), selectinload(StickerPack.moderation))
            .order_by(StickerPack.created_at.desc())
        )
        result = await self.db.execute(q)
        out = []
        for pack in result.scalars().all():
            d = await self._pack_dict(pack, include_stickers=True)
            if status and d.get("moderation_status") != status:
                continue
            if not status and d.get("moderation_status") not in (
                ModerationStatus.PENDING.value,
                ModerationStatus.REJECTED.value,
            ):
                continue
            out.append(d)
        return out

    async def approve_pack(self, admin: User, pack_id: uuid.UUID) -> dict:
        pack = await self._get_pack(pack_id)
        if pack.is_official:
            raise ValueError("invalid_pack")
        if len(pack.stickers or []) < MIN_STICKERS:
            raise ValueError("too_few_stickers")
        if not pack.moderation:
            pack.moderation = StickerPackModeration(pack_id=pack.id, status=ModerationStatus.APPROVED)
            self.db.add(pack.moderation)
        pack.moderation.status = ModerationStatus.APPROVED
        pack.moderation.reviewed_by = admin.id
        pack.moderation.reviewed_at = datetime.now(timezone.utc)
        pack.moderation.rejection_reason = None
        pack.is_active = True
        await self.db.commit()
        return await self._pack_dict(await self._get_pack(pack_id), include_stickers=True)

    async def reject_pack(self, admin: User, pack_id: uuid.UUID, reason: str) -> dict:
        pack = await self._get_pack(pack_id)
        if pack.is_official:
            raise ValueError("invalid_pack")
        reason = (reason or "").strip()
        if len(reason) < 3:
            raise ValueError("reason_required")
        if not pack.moderation:
            pack.moderation = StickerPackModeration(pack_id=pack.id, status=ModerationStatus.REJECTED)
            self.db.add(pack.moderation)
        pack.moderation.status = ModerationStatus.REJECTED
        pack.moderation.reviewed_by = admin.id
        pack.moderation.reviewed_at = datetime.now(timezone.utc)
        pack.moderation.rejection_reason = reason
        pack.is_active = False
        await self.db.commit()
        return await self._pack_dict(await self._get_pack(pack_id), include_stickers=True)

    async def create_official(
        self,
        admin: User,
        name: str,
        description: str | None,
        price: Decimal,
        cover: tuple[bytes, str] | None,
        stickers: list[tuple[bytes, str]],
        is_active: bool = True,
    ) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("invalid_name")
        price_i = self._price_int(price)
        if price_i < 0 or price_i > MAX_USER_PRICE:
            raise ValueError("invalid_price")
        if len(stickers) < MIN_STICKERS:
            raise ValueError("too_few_stickers")
        if len(stickers) > MAX_STICKERS:
            raise ValueError("too_many_stickers")
        pack = StickerPack(
            creator_id=None,
            name=name,
            description=(description or "").strip() or None,
            price=Decimal(price_i),
            is_official=True,
            is_active=is_active,
        )
        self.db.add(pack)
        await self.db.flush()
        if cover:
            self._validate_image(cover[0], cover[1], COVER_MAX_BYTES)
            pack.cover_image_url = StorageService.upload_file(
                cover[0], f"stickers/{pack.id}/cover/{uuid.uuid4()}.webp", cover[1]
            )
        for i, (data, ctype) in enumerate(stickers):
            self._validate_image(data, ctype, STICKER_MAX_BYTES)
            url = StorageService.upload_file(
                data, f"stickers/{pack.id}/{uuid.uuid4()}.webp", ctype
            )
            self.db.add(Sticker(pack_id=pack.id, image_url=url, sort_order=i))
        self.db.add(
            StickerPackModeration(
                pack_id=pack.id,
                status=ModerationStatus.APPROVED,
                reviewed_by=admin.id,
                reviewed_at=datetime.now(timezone.utc),
            )
        )
        await self.db.commit()
        return await self._pack_dict(await self._get_pack(pack.id), include_stickers=True)

    async def update_official(
        self,
        pack_id: uuid.UUID,
        name: str | None = None,
        description: str | None = None,
        price: Decimal | None = None,
        is_active: bool | None = None,
        cover: tuple[bytes, str] | None = None,
    ) -> dict:
        pack = await self._get_pack(pack_id)
        if not pack.is_official:
            raise ValueError("not_official")
        if name is not None:
            cleaned = name.strip()
            if not cleaned:
                raise ValueError("invalid_name")
            pack.name = cleaned
        if description is not None:
            pack.description = description.strip() or None
        if price is not None:
            price_i = self._price_int(price)
            if price_i < 0 or price_i > MAX_USER_PRICE:
                raise ValueError("invalid_price")
            pack.price = Decimal(price_i)
        if is_active is not None:
            pack.is_active = is_active
        if cover:
            self._validate_image(cover[0], cover[1], COVER_MAX_BYTES)
            pack.cover_image_url = StorageService.upload_file(
                cover[0], f"stickers/{pack.id}/cover/{uuid.uuid4()}.webp", cover[1]
            )
        await self.db.commit()
        return await self._pack_dict(await self._get_pack(pack_id), include_stickers=True)

    async def delete_official(self, pack_id: uuid.UUID) -> None:
        pack = await self._get_pack(pack_id)
        if not pack.is_official:
            raise ValueError("not_official")
        pack.is_active = False
        await self.db.commit()

    async def list_official(self) -> list[dict]:
        result = await self.db.execute(
            select(StickerPack)
            .where(StickerPack.is_official.is_(True))
            .options(selectinload(StickerPack.stickers), selectinload(StickerPack.moderation))
            .order_by(StickerPack.created_at.desc())
        )
        return [await self._pack_dict(p, include_stickers=True) for p in result.scalars().all()]

    async def stats(self) -> dict:
        top_res = await self.db.execute(
            select(StickerPack)
            .where(StickerPack.is_active.is_(True))
            .options(selectinload(StickerPack.stickers), selectinload(StickerPack.moderation))
            .order_by(StickerPack.purchase_count.desc())
            .limit(20)
        )
        top = [await self._pack_dict(p, preview=4) for p in top_res.scalars().all()]
        fee_res = await self.db.execute(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
                WalletTransaction.transaction_type == TX_FEE
            )
        )
        sales_res = await self.db.execute(
            select(func.coalesce(func.sum(StickerPack.purchase_count), 0)).where(
                StickerPack.price > 0
            )
        )
        active_res = await self.db.execute(
            select(func.count()).select_from(StickerPack).where(StickerPack.is_active.is_(True))
        )
        return {
            "top_packs": top,
            "total_commission": float(fee_res.scalar() or 0),
            "total_sales": int(sales_res.scalar() or 0),
            "active_packs": int(active_res.scalar() or 0),
        }
