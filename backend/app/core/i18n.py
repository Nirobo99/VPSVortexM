import json
from pathlib import Path

LOCALES_DIR = Path(__file__).resolve().parent.parent / "locales"
_cache: dict[str, dict] = {}


def load_locale(lang: str) -> dict:
    if lang in _cache:
        return _cache[lang]
    path = LOCALES_DIR / f"{lang}.json"
    if not path.exists():
        path = LOCALES_DIR / "ru.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _cache[lang] = data
    return data


def t(key: str, lang: str = "ru", **kwargs) -> str:
    data = load_locale(lang)
    parts = key.split(".")
    value = data
    for part in parts:
        if isinstance(value, dict):
            value = value.get(part, key)
        else:
            return key
    if isinstance(value, str) and kwargs:
        try:
            return value.format(**kwargs)
        except (KeyError, ValueError):
            return value
    return str(value) if value else key
