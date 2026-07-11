import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._pubsub_task: asyncio.Task | None = None
        self._listener_started = False

    async def _ensure_listener(self) -> None:
        if self._listener_started:
            return
        self._listener_started = True
        self._pubsub_task = asyncio.create_task(self._redis_listener())

    async def _redis_listener(self) -> None:
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.psubscribe("ws:user:*")
        try:
            async for raw in pubsub.listen():
                if raw["type"] not in ("pmessage", "message"):
                    continue
                channel = raw.get("channel") or raw.get("pattern", "")
                if isinstance(channel, bytes):
                    channel = channel.decode()
                user_id = channel.split(":")[-1]
                data = raw.get("data")
                if isinstance(data, bytes):
                    data = data.decode()
                await self._send_local(user_id, json.loads(data))
        except asyncio.CancelledError:
            await pubsub.punsubscribe("ws:user:*")
            raise
        except Exception:
            logger.exception("WebSocket Redis listener error")
            self._listener_started = False

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        await self._ensure_listener()
        self._connections[user_id].add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        self._connections[user_id].discard(websocket)
        if not self._connections[user_id]:
            del self._connections[user_id]

    async def _send_local(self, user_id: str, event: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(user_id, [])):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def publish(self, user_id: str, event: dict) -> None:
        redis = await get_redis()
        await redis.publish(f"ws:user:{user_id}", json.dumps(event))
        await self._send_local(user_id, event)

    async def publish_many(self, user_ids: list[str], event: dict) -> None:
        for uid in set(user_ids):
            await self.publish(uid, event)


ws_manager = WebSocketManager()
