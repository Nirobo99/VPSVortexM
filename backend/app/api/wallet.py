import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.i18n import t
from app.models.user import User
from app.schemas.payments import (
    ConvertToVmoneyRequest,
    ConvertToVmoneyResponse,
    InvisiblePurchaseResponse,
    PaymentResponse,
    TopUpRequest,
    TopUpResponse,
    TransferRequest,
    TransferResponse,
    WalletBalanceResponse,
    WalletHistoryResponse,
)
from app.services.payment_service import INVISIBLE_MONTHLY_PRICE, PaymentService

router = APIRouter(prefix="/wallet", tags=["wallet"])


def _lang(request: Request) -> str:
    return request.headers.get("Accept-Language", "ru")[:2]


@router.get("/balance", response_model=WalletBalanceResponse)
async def get_balance(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = PaymentService(db)
    data = await service.get_balance(user)
    return WalletBalanceResponse(**data)


@router.get("/history", response_model=WalletHistoryResponse)
async def get_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = PaymentService(db)
    data = await service.get_history(user)
    return WalletHistoryResponse(**data)


@router.post("/convert", response_model=ConvertToVmoneyResponse)
async def convert_to_vmoney(
    body: ConvertToVmoneyRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = PaymentService(db)
    try:
        data = await service.convert_to_vmoney(user, body.amount)
    except ValueError as e:
        key = str(e.args[0]) if e.args else "invalid_amount"
        raise HTTPException(status_code=400, detail=t(f"wallet.{key}", lang))
    except Exception:
        # Ensure column then retry once — covers missed migration/soft-repair.
        try:
            await service._ensure_vmoney_column()
            data = await service.convert_to_vmoney(user, body.amount)
        except ValueError as e:
            key = str(e.args[0]) if e.args else "invalid_amount"
            raise HTTPException(status_code=400, detail=t(f"wallet.{key}", lang))
        except Exception:
            raise HTTPException(status_code=500, detail=t("errors.internal", lang))
    return ConvertToVmoneyResponse(**data)


@router.post("/topup", response_model=TopUpResponse, status_code=status.HTTP_201_CREATED)
async def create_topup(
    body: TopUpRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = PaymentService(db)
    try:
        data = await service.create_topup(user, body.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"wallet.{e}", lang))
    return TopUpResponse(**data)


@router.get("/payments/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = PaymentService(db)
    try:
        payment = await service.get_payment(user, uuid.UUID(payment_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"wallet.{e}", lang))
    return PaymentResponse(**service._payment_dict(payment))


@router.post("/payments/{payment_id}/confirm")
async def confirm_payment(
    payment_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = PaymentService(db)
    try:
        data = await service.confirm_payment(user, uuid.UUID(payment_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=t(f"wallet.{e}", lang))
    return data


@router.post("/webhook")
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    from app.core.config import get_settings

    settings = get_settings()
    if settings.yookassa_webhook_secret:
        provided = request.headers.get("X-YooKassa-Secret")
        if provided != settings.yookassa_webhook_secret:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    service = PaymentService(db)
    await service.handle_webhook(body)
    return {"status": "ok"}


@router.post("/transfer", response_model=TransferResponse)
async def transfer(
    body: TransferRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = PaymentService(db)
    try:
        data = await service.transfer(user, body.username, body.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"wallet.{e}", lang))
    return TransferResponse(**data)


@router.post("/invisible", response_model=InvisiblePurchaseResponse)
async def purchase_invisible(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = _lang(request)
    service = PaymentService(db)
    try:
        data = await service.purchase_invisible(user, user.invisible_fake_last_seen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=t(f"wallet.{e}", lang))
    return InvisiblePurchaseResponse(**data)


@router.get("/prices")
async def get_prices():
    return {
        "invisible_monthly": INVISIBLE_MONTHLY_PRICE,
        "group_extension": 500,
    }
