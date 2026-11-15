"""Reject URLs that could make the inspector reach internal systems (SSRF protection)."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

ALLOWED_SCHEMES = {"http", "https"}
ALLOWED_PORTS = {None, 80, 443}
BLOCKED_SUFFIXES = (".local", ".localhost", ".internal", ".lan", ".home")
MAX_URL_LENGTH = 2048


class UnsafeUrlError(ValueError):
    """The URL must not be fetched. The message is safe to show to the person."""


def _is_public(ip_text: str) -> bool:
    ip = ipaddress.ip_address(ip_text.split("%")[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global


def validate_url(url: str, resolver=socket.getaddrinfo, allow_private: bool = False) -> str:
    """Return the URL if every address its host resolves to is public; raise UnsafeUrlError otherwise.

    allow_private skips the port and address checks. It exists for local development and tests
    only; never set it from request data.
    """
    if not isinstance(url, str) or not url.strip() or len(url) > MAX_URL_LENGTH:
        raise UnsafeUrlError("Enter a website URL of up to 2048 characters.")
    url = url.strip()
    if any(c.isspace() or ord(c) < 32 for c in url):
        raise UnsafeUrlError("The URL contains spaces or control characters.")
    parts = urlsplit(url)
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("Only http and https URLs can be inspected.")
    if parts.username or parts.password:
        raise UnsafeUrlError("URLs with a username or password are not allowed.")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise UnsafeUrlError("The URL has no host name.")
    try:
        port = parts.port
    except ValueError:
        raise UnsafeUrlError("The URL has an invalid port.") from None
    if allow_private:
        return url
    if port not in ALLOWED_PORTS:
        raise UnsafeUrlError("Only the standard web ports (80 and 443) can be inspected.")
    if host == "localhost" or host.endswith(BLOCKED_SUFFIXES):
        raise UnsafeUrlError("Internal host names cannot be inspected.")
    try:
        addresses = {info[4][0] for info in resolver(host, port or (443 if parts.scheme.lower() == "https" else 80))}
    except (OSError, UnicodeError):
        raise UnsafeUrlError("The host name could not be resolved.") from None
    try:
        public = bool(addresses) and all(_is_public(a) for a in addresses)
    except ValueError:
        public = False
    if not public:
        raise UnsafeUrlError("The URL points to a private or internal address and cannot be inspected.")
    return url
