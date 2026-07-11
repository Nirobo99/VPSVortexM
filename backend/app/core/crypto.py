import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

settings = get_settings()


class CryptoService:
    def __init__(self, raw_key: str | None = None):
        raw_key = raw_key or settings.message_encryption_key
        self._key = self._normalize_key(raw_key)

    @staticmethod
    def _normalize_key(raw_key: str) -> bytes:
        if raw_key.startswith("base64:"):
            key = base64.b64decode(raw_key[7:])
        else:
            key = raw_key.encode("utf-8")
        if len(key) != 32:
            raise ValueError("MESSAGE_ENCRYPTION_KEY must be exactly 32 bytes or base64-encoded 32 bytes")
        return key

    def encrypt(self, plain_text: str) -> bytes:
        nonce = os.urandom(12)
        ciphertext = AESGCM(self._key).encrypt(nonce, plain_text.encode("utf-8"), None)
        return nonce + ciphertext

    def decrypt(self, cipher_bytes: bytes) -> str:
        nonce, ciphertext = cipher_bytes[:12], cipher_bytes[12:]
        plain = AESGCM(self._key).decrypt(nonce, ciphertext, None)
        return plain.decode("utf-8")
