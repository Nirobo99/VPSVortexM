from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class StickerItem(BaseModel):
    id: str
    pack_id: str
    image_url: str | None
    sort_order: int
    created_at: str


class StickerPackCard(BaseModel):
    id: str
    name: str
    description: str | None
    price: float
    is_official: bool
    is_active: bool
    cover_image_url: str | None
    purchase_count: int
    creator_id: str | None = None
    creator_username: str | None = None
    creator_display_name: str | None = None
    sticker_count: int = 0
    owned: bool = False
    moderation_status: str | None = None
    rejection_reason: str | None = None
    created_at: str
    preview_stickers: list[StickerItem] = []


class StickerPackDetail(StickerPackCard):
    stickers: list[StickerItem] = []
    my_revenue: float | None = None


class MarketplacePage(BaseModel):
    items: list[StickerPackCard]
    total: int
    page: int
    limit: int
    has_more: bool


class PackCreateMeta(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    price: Decimal = Field(ge=10, le=10000)
    submit: bool = True


class PackUpdateMeta(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    price: Decimal | None = Field(None, ge=10, le=10000)
    submit: bool = False


class StickerReorderItem(BaseModel):
    id: str
    sort_order: int


class StickerReorderRequest(BaseModel):
    items: list[StickerReorderItem]


class RejectPackRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class OfficialPackMeta(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    price: Decimal = Field(ge=0, le=10000)
    is_active: bool = True


class InstalledPacksResponse(BaseModel):
    packs: list[StickerPackDetail]
    installed_count: int
    slot_limit: int | None
    slots_used: int


class StickerStatsResponse(BaseModel):
    top_packs: list[StickerPackCard]
    total_commission: float
    total_sales: int
    active_packs: int
