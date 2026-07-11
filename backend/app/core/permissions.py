"""RBAC permission definitions for the admin panel."""

from typing import Any

# Flat permission strings: resource:action
ALL_PERMISSIONS: list[str] = [
    "dashboard:view",
    "users:view",
    "users:edit",
    "users:ban",
    "users:unban",
    "users:delete",
    "users:verify",
    "users:export",
    "channels:view",
    "channels:edit",
    "channels:delete",
    "channels:verify",
    "channels:transfer",
    "groups:view",
    "groups:delete",
    "complaints:view",
    "complaints:resolve",
    "ads:view",
    "ads:edit",
    "broadcasts:view",
    "broadcasts:send",
    "pages:view",
    "pages:edit",
    "settings:view",
    "settings:edit",
    "settings:critical",
    "finance:view",
    "finance:adjust",
    "finance:export",
    "logs:view",
    "backups:view",
    "backups:create",
    "backups:restore",
    "admins:view",
    "admins:manage",
    "superadmin:commands",
]

ROLE_TEMPLATES: dict[str, list[str]] = {
    "superadmin": ["*"],
    "admin": [p for p in ALL_PERMISSIONS if p not in ("settings:critical", "backups:restore", "superadmin:commands")],
    "moderator": [
        "dashboard:view",
        "users:view",
        "users:ban",
        "channels:view",
        "channels:delete",
        "groups:view",
        "groups:delete",
        "complaints:view",
        "complaints:resolve",
        "logs:view",
    ],
    "support": [
        "dashboard:view",
        "users:view",
        "users:unban",
        "complaints:view",
        "complaints:resolve",
        "finance:view",
    ],
    "content_manager": [
        "dashboard:view",
        "channels:view",
        "channels:edit",
        "channels:delete",
        "channels:verify",
        "groups:view",
        "ads:view",
        "ads:edit",
        "broadcasts:view",
        "broadcasts:send",
        "pages:view",
        "pages:edit",
    ],
}

SUPERADMIN_USERNAME = "моргенштерн@2399"


def permissions_from_json(data: dict[str, Any] | None) -> list[str]:
    if not data:
        return []
    flat: list[str] = []
    for resource, actions in data.items():
        if isinstance(actions, list):
            for action in actions:
                flat.append(f"{resource}:{action}")
        elif actions == "*":
            flat.append(f"{resource}:*")
    return flat


def effective_permissions(role: str, custom: dict[str, Any] | None) -> list[str]:
    if role == "superadmin":
        return ["*"]
    base = list(ROLE_TEMPLATES.get(role, []))
    custom_flat = permissions_from_json(custom)
    if custom_flat:
        return list(set(base + custom_flat))
    return base


def has_permission(perms: list[str], resource: str, action: str) -> bool:
    if "*" in perms:
        return True
    key = f"{resource}:{action}"
    if key in perms:
        return True
    if f"{resource}:*" in perms:
        return True
    return False
