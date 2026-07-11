import bleach


ALLOWED_TAGS = [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "h1",
    "h2",
    "h3",
    "h4",
]
ALLOWED_ATTRIBUTES = {"a": ["href", "title", "target", "rel"]}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


def sanitize_html(value: str | None) -> str | None:
    if value is None:
        return None
    return bleach.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )
