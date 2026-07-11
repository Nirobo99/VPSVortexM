from fastapi import Request
import ipaddress

from app.core.config import get_settings

settings = get_settings()


def _is_trusted_proxy(ip: str) -> bool:
    for entry in settings.trusted_proxies:
        try:
            if "/" in entry:
                if ipaddress.ip_address(ip) in ipaddress.ip_network(entry, strict=False):
                    return True
            elif ip == entry:
                return True
        except ValueError:
            continue
    return False


def get_client_ip(request: Request) -> str:
    direct_ip = request.client.host if request.client else "unknown"
    if direct_ip != "unknown" and _is_trusted_proxy(direct_ip):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
    if direct_ip:
        return direct_ip
    return "unknown"
