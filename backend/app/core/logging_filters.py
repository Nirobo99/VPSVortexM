from __future__ import annotations

import json
import logging
from typing import Any


SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "new_password",
    "refresh_token",
    "access_token",
    "token",
    "totp_code",
    "secret",
    "content",
    "content_e2e",
    "content_encrypted",
    "encrypted_content",
    "message",
    "message_text",
}


def _sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if k.lower() in SENSITIVE_KEYS else _sanitize(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    if isinstance(value, tuple):
        return tuple(_sanitize(v) for v in value)
    if isinstance(value, str) and len(value) > 4096:
        return value[:256] + "...[TRUNCATED]"
    return value


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, dict):
            record.msg = _sanitize(record.msg)
        elif isinstance(record.msg, str):
            lowered = record.msg.lower()
            if any(key in lowered for key in ("content=", "password=", "token=", "totp=", "secret=")):
                record.msg = "[REDACTED SENSITIVE LOG MESSAGE]"

        if record.args:
            sanitized_args = _sanitize(record.args)
            record.args = sanitized_args
        return True


def configure_sensitive_logging() -> None:
    root = logging.getLogger()
    for handler in root.handlers:
        handler.addFilter(SensitiveDataFilter())


def safe_json_dumps(payload: Any) -> str:
    return json.dumps(_sanitize(payload), ensure_ascii=False, default=str)
