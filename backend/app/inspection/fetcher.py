"""Plain HTTP fetch that validates every redirect hop before following it."""
from __future__ import annotations

import time
import urllib.error
import urllib.request
from urllib.parse import urljoin

from .url_safety import UnsafeUrlError, validate_url

USER_AGENT = "ProofWorkInspector/1.0 (+evidence gathering; no form submission)"
REDIRECTS = {301, 302, 303, 307, 308}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch(url: str, allow_private: bool = False, timeout: float = 10, max_bytes: int = 2_000_000,
          max_redirects: int = 5) -> dict:
    """Return {"url", "status", "ms", "html", "error"}. Never raises for site or network problems."""
    opener = urllib.request.build_opener(_NoRedirect)
    result = {"url": url, "status": None, "ms": None, "html": "", "error": None}
    started = time.monotonic()
    try:
        for _ in range(max_redirects + 1):
            validate_url(url, allow_private=allow_private)
            result["url"] = url
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.5"})
            try:
                response = opener.open(request, timeout=timeout)
            except urllib.error.HTTPError as err:
                response = err
            with response:
                status = response.status if hasattr(response, "status") else response.code
                location = response.headers.get("Location")
                if status in REDIRECTS and location:
                    url = urljoin(url, location.strip())
                    continue
                result["status"] = status
                kind = (response.headers.get("Content-Type") or "").lower()
                if "html" in kind or "text" in kind or not kind:
                    charset = response.headers.get_content_charset() or "utf-8"
                    try:
                        result["html"] = response.read(max_bytes).decode(charset, "replace")
                    except LookupError:
                        result["html"] = ""
                break
        else:
            result["error"] = "The site redirected too many times."
    except UnsafeUrlError as err:
        result["error"] = str(err)
    except Exception as err:  # DNS failure, refused connection, TLS error, timeout
        reason = getattr(err, "reason", err)
        result["error"] = f"The site could not be reached: {reason}"[:300]
    result["ms"] = int((time.monotonic() - started) * 1000)
    return result
