import io
import uuid
from functools import lru_cache
from urllib.parse import urlparse

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
        base = settings.s3_public_url.rstrip("/")
        clean_key = key.lstrip("/")
        return f"{base}/{clean_key}"

    @staticmethod
    def key_from_url(url_or_key: str | None) -> str | None:
        if not url_or_key:
            return None

        value = url_or_key.strip()
        if not value.startswith("http") and not value.startswith("/"):
            return value

        public_base = settings.s3_public_url.rstrip("/")
        if value.startswith(f"{public_base}/"):
            return value[len(public_base) + 1 :]

        if value.startswith("/media/"):
            return value[len("/media/") :]

        bucket_marker = f"/{settings.s3_bucket}/"
        if bucket_marker in value:
            return value.split(bucket_marker, 1)[-1]

        parsed = urlparse(value)
        path = parsed.path.lstrip("/")
        if path.startswith(f"{settings.s3_bucket}/"):
            return path[len(settings.s3_bucket) + 1 :]

        return path or None

    @staticmethod
    def generate_presigned_url(url_or_key: str | None, expires_in: int | None = None) -> str | None:
        key = StorageService.key_from_url(url_or_key)
        if not key:
            return None

        # Public media is served via nginx /media/ → MinIO
        if not settings.s3_private_bucket:
            return StorageService.public_url_for_key(key)

        client = _get_client()
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=expires_in or settings.storage_presign_ttl_seconds,
        )
        # Rewrite internal MinIO host to public URL when possible
        public_base = settings.s3_public_url.rstrip("/")
        internal_base = settings.s3_endpoint.rstrip("/")
        if public_base and internal_base and url.startswith(internal_base):
            return url.replace(internal_base, public_base, 1)
        return url

    @staticmethod
    def ensure_bucket() -> None:
        client = _get_client()
        try:
            client.head_bucket(Bucket=settings.s3_bucket)
        except ClientError:
            client.create_bucket(Bucket=settings.s3_bucket)

    @staticmethod
    def ensure_public_read() -> None:
        """Allow anonymous GET for public bucket (avatars, media via nginx /media/)."""
        if settings.s3_private_bucket:
            return
        client = _get_client()
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{settings.s3_bucket}/*"],
                }
            ],
        }
        import json

        try:
            client.put_bucket_policy(Bucket=settings.s3_bucket, Policy=json.dumps(policy))
        except ClientError:
            pass

    @staticmethod
    def upload_file(content: bytes, key: str, content_type: str) -> str:
        if len(content) > MAX_FILE_SIZE:
            raise ValueError("file_too_large")
        client = _get_client()
        StorageService.ensure_bucket()
        StorageService.ensure_public_read()
        client.put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
            CacheControl="public, max-age=86400",
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
    def upload_group_avatar(dialog_id: uuid.UUID, content: bytes, content_type: str) -> str:
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise ValueError("invalid_image_type")
        ext = content_type.split("/")[-1].replace("jpeg", "jpg")
        key = f"groups/{dialog_id}/avatar/{uuid.uuid4()}.{ext}"
        return StorageService.upload_file(content, key, content_type)

    @staticmethod
    def upload_channel_avatar(channel_id: uuid.UUID, content: bytes, content_type: str) -> str:
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise ValueError("invalid_image_type")
        ext = content_type.split("/")[-1].replace("jpeg", "jpg")
        key = f"channels/{channel_id}/avatar/{uuid.uuid4()}.{ext}"
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
    def upload_profile_post_media(user_id: uuid.UUID, content: bytes, content_type: str) -> str:
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise ValueError("invalid_image_type")
        ext = content_type.split("/")[-1].replace("jpeg", "jpg")
        key = f"profile_posts/{user_id}/{uuid.uuid4()}.{ext}"
        return StorageService.upload_file(content, key, content_type)

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
