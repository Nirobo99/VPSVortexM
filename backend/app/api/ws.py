import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.rate_limit import RateLimitService
from app.core.security import verify_token
from app.core.token_blacklist import is_token_revoked
from app.models.user import User
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["websocket"])
settings = get_settings()


async def _authenticate_ws(token: str) -> User | None:
    payload = verify_token(token, "access")
    if not payload:
        return None
    if await is_token_revoked(payload.get("jti")):
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == uuid.UUID(payload["sub"])))
        user = result.scalar_one_or_none()
        if not user or not user.is_active or user.is_banned:
            return None
        return user


def _cookie_token(websocket: WebSocket) -> str | None:
    cookie_header = websocket.headers.get("cookie", "")
    for item in cookie_header.split(";"):
        key, _, value = item.strip().partition("=")
        if key == "access_token" and value:
            return value
    return None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = Query(None)):
    token = _cookie_token(websocket) or token
    user = await _authenticate_ws(token)
    if not user:
        await websocket.close(code=4001)
        return

    user_id = str(user.id)
    allowed, _ = await RateLimitService.track_websocket_connection(user_id, settings.websocket_connections_per_user)
    if not allowed:
        await websocket.close(code=4429)
        return
    await ws_manager.connect(user_id, websocket)
    try:
        await websocket.send_json({"type": "connected", "user_id": user_id})
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "typing":
                dialog_id = data.get("dialog_id")
                if dialog_id:
                    from app.services.messaging_service import MessagingService

                    async with AsyncSessionLocal() as db:
                        service = MessagingService(db)
                        await service._require_participant(uuid.UUID(dialog_id), user.id)
                        other_ids = await service._other_user_ids(uuid.UUID(dialog_id), user.id)
                    await ws_manager.publish_many(
                        [str(uid) for uid in other_ids],
                        {"type": "typing", "dialog_id": dialog_id, "user_id": user_id},
                    )
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(user_id, websocket)
        await RateLimitService.release_websocket_connection(user_id)
