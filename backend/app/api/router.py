from fastapi import APIRouter

from app.api import (
    admin_auth,
    admin_panel,
    admin_stickers,
    auth,
    calls,
    channels,
    chats,
    complaints,
    conversations,
    public_pages,
    referral,
    stickers,
    users,
    wallet,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(chats.router)
api_router.include_router(calls.router)
api_router.include_router(channels.router)
api_router.include_router(conversations.router)
api_router.include_router(wallet.router)
api_router.include_router(stickers.router)
api_router.include_router(referral.router)
api_router.include_router(complaints.router)
api_router.include_router(public_pages.router)
api_router.include_router(admin_auth.router)
api_router.include_router(admin_panel.router)
api_router.include_router(admin_stickers.router)
