import json
import uuid

from livekit.api import AccessToken, VideoGrants

from app.core.config import get_settings

settings = get_settings()


def _public_livekit_url() -> str:
    url = settings.livekit_url
    if url.startswith("ws://livekit:"):
        return url.replace("ws://livekit:", "ws://localhost:")
    return url


class LiveKitService:
    @staticmethod
    def create_token(
        room_name: str,
        identity: str,
        name: str,
        metadata: dict | None = None,
        can_publish: bool = True,
        room_admin: bool = False,
    ) -> str:
        grants = VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=can_publish,
            can_subscribe=True,
            can_publish_data=True,
            room_admin=room_admin,
        )
        token = AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        token.with_identity(identity)
        token.with_name(name)
        if metadata:
            token.with_metadata(json.dumps(metadata))
        token.with_grants(grants)
        return token.to_jwt()

    @staticmethod
    def room_name_for_call(call_id: uuid.UUID) -> str:
        return f"vortexm-call-{call_id}"

    @staticmethod
    def get_ws_url() -> str:
        return _public_livekit_url()
