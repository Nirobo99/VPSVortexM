from pydantic import BaseModel, Field


class TopUpRequest(BaseModel):
    amount: int = Field(ge=10, le=100_000)


class TopUpResponse(BaseModel):
    payment_id: str
    confirmation_url: str | None
    status: str
    amount: int


class WalletBalanceResponse(BaseModel):
    balance: int


class PaymentResponse(BaseModel):
    id: str
    amount: int
    status: str
    description: str | None
    created_at: str
    completed_at: str | None


class TransactionResponse(BaseModel):
    id: str
    amount: int
    balance_after: int
    transaction_type: str
    description: str | None
    created_at: str


class WalletHistoryResponse(BaseModel):
    balance: int
    payments: list[PaymentResponse]
    transactions: list[TransactionResponse]
