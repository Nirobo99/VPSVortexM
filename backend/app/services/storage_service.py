import io
import uuid
from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings

settings = get_settings()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm"}
ALLOWED_AUDIO_TYPES = {"audio/ogg", "audio/mpeg", "audio/webm", "audio/mp4", "audio/wav"}
ALLOWED_FILE_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES | ALLOWED_AUDIO_TYPES | {
    "application/pdf",
    "application/zip",
    "application/octet-stream",
}
MAX_FILE_SIZE = 50 * 1024 * 1024


@lru_cache
def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


class StorageService:
    @staticmethod
    def public_url_for_key(key: str) -> str:
        return f"{settings.s3_public_url}/{key}"

    @staticmethod
    def key_from_url(url_or_key: str | None) -> str | None:
        if not url_or_key:
            return None
        prefix = f"{settings.s3_public_url}/"
        if url_or_key.startswith(prefix):
            return url_or_key[len(prefix):]
        return url_or_key

    @staticmethod
    def generate_presigned_url(url_or_key: str | None, expires_in: int | None = None) -> str | None:
        key = StorageService.key_from_url(url_or_key)
        if not key:
            return None
        if not settings.s3_private_bucket:
            return StorageService.public_url_for_key(key)
        client = _get_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=expires_in or settings.storage_presign_ttl_seconds,
        )

    @staticmethod
    def ensure_bucket() -> None:
        client = _get_client()
        try:
            client.head_bucket(Bucket=settings.s3_bucket)
        except ClientError:
            client.create_bucket(Bucket=settings.s3_bucket)

    @staticmethod
    def upload_file(content: bytes, key: str, content_type: str) -> str:
        if len(content) > MAX_FILE_SIZE:
            raise ValueError("file_too_large")
        client = _get_client()
        StorageService.ensure_bucket()
        client.put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
        return StorageService.public_url_for_key(key)

    @staticmethod
    def upload_avatar(user_id: uuid.UUID, content: bytes, content_type: str) -> str:
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise ValueError("invalid_image_type")
        ext = content_type.split("/")[-1].replace("jpeg", "jpg")
        key = f"avatars/{user_id}/{uuid.uuid4()}.{ext}"
        return StorageService.upload_file(content, key, content_type)

    @staticmethod
    def upload_story_media(user_id: uuid.UUID, content: bytes, content_type: str) -> tuple[str, str]:
        if content_type in ALLOWED_IMAGE_TYPES:
            ext = content_type.split("/")[-1].replace("jpeg", "jpg")
            media_type = "image"
        elif content_type in ALLOWED_VIDEO_TYPES:
            ext = content_type.split("/")[-1]
            media_type = "video"
        else:
            raise ValueError("invalid_media_type")
        key = f"stories/{user_id}/{uuid.uuid4()}.{ext}"
        url = StorageService.upload_file(content, key, content_type)
        return url, media_type

    @staticmethod
    def upload_message_media(
        dialog_id: uuid.UUID, user_id: uuid.UUID, content: bytes, content_type: str, message_type: str
    ) -> tuple[str, str]:
        if content_type not in ALLOWED_FILE_TYPES:
            raise ValueError("invalid_file_type")
        ext_map = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "video/mp4": "mp4",
            "video/webm": "webm",
            "audio/ogg": "ogg",
            "audio/mpeg": "mp3",
            "audio/webm": "webm",
            "audio/mp4": "m4a",
            "audio/wav": "wav",
            "application/pdf": "pdf",
            "application/zip": "zip",
        }
        ext = ext_map.get(content_type, "bin")
        folder = message_type if message_type in ("voice", "video_note", "file") else "media"
        key = f"messages/{dialog_id}/{user_id}/{folder}/{uuid.uuid4()}.{ext}"
        url = StorageService.upload_file(content, key, content_type)
        return url, content_type

    @staticmethod
    def delete_by_url(url: str) -> None:
        key = StorageService.key_from_url(url)
        if not key:
            return
        client = _get_client()
        try:
            client.delete_object(Bucket=settings.s3_bucket, Key=key)
        except ClientError:
            pass
