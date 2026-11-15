"""Playwright evidence: rendered HTML, screenshots and responsive measurements.

Every request the page makes is checked with validate_url, and the address the page ends
on is checked again, because redirects can bypass request interception.
"""
from __future__ import annotations

from urllib.parse import urlsplit

from .url_safety import UnsafeUrlError, validate_url

VIEWPORTS = [("Desktop", 1440, 900), ("Tablet", 768, 1024), ("Mobile", 390, 844)]
MEASURE = """() => ({
  overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  viewport: !!document.querySelector('meta[name="viewport"]'),
})"""


class BrowserUnavailable(RuntimeError):
    """Playwright or its browser is not installed, or the browser failed to start."""


class Browser:
    def __init__(self, allow_private: bool = False, timeout_ms: int = 15000, validator=None):
        self._validate = validator or (lambda u: validate_url(u, allow_private=allow_private))
        self._timeout = timeout_ms
        self._verdicts = {}
        self._pw = self._browser = None
        self.executable_path = None

    def __enter__(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise BrowserUnavailable("Playwright is not installed (pip install playwright, then playwright install chromium).") from None
        try:
            self._pw = sync_playwright().start()
            self.executable_path = self._pw.chromium.executable_path
            self._browser = self._pw.chromium.launch()
        except Exception as err:
            self.__exit__(None, None, None)
            raise BrowserUnavailable(f"The browser could not start: {str(err).splitlines()[0][:200]}") from None
        return self

    def __exit__(self, *exc):
        for closer in (getattr(self._browser, "close", None), getattr(self._pw, "stop", None)):
            try:
                if closer:
                    closer()
            except Exception:
                pass
        self._browser = self._pw = None

    def _allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        if parts.scheme in ("data", "blob", "about"):
            return True
        key = (parts.scheme, parts.netloc)
        if key not in self._verdicts:
            try:
                self._validate(url)
                self._verdicts[key] = True
            except UnsafeUrlError:
                self._verdicts[key] = False
        return self._verdicts[key]

    def _guard(self, route):
        try:
            if self._allowed(route.request.url):
                route.continue_()
            else:
                route.abort("blockedbyclient")
        except Exception:
            pass  # the page closed while the request was pending

    def capture(self, url: str, width: int, height: int, shot_path: str | None = None) -> dict:
        """Load one page at one viewport. Never raises; failures are returned in "error"."""
        out = {"url": url, "status": None, "html": "", "horizontal_overflow": None, "viewport_meta": None,
               "shot_taken": False, "error": None}
        context = None
        try:
            context = self._browser.new_context(viewport={"width": width, "height": height},
                                                service_workers="block", accept_downloads=False)
            context.set_default_timeout(self._timeout)
            page = context.new_page()
            page.on("dialog", lambda dialog: dialog.dismiss())
            page.route("**/*", self._guard)
            response = page.goto(url, wait_until="load", timeout=self._timeout)
            try:
                page.wait_for_load_state("networkidle", timeout=3000)
            except Exception:
                pass  # busy pages never go idle; the load event is enough
            out["url"] = page.url
            self._validate(page.url)  # raises if a redirect ended somewhere unsafe
            out["status"] = response.status if response else None
            measured = page.evaluate(MEASURE)
            out["horizontal_overflow"] = bool(measured["overflow"])
            out["viewport_meta"] = bool(measured["viewport"])
            out["html"] = page.content()[:2_000_000]
            if shot_path:
                page.screenshot(path=shot_path, full_page=False)
                out["shot_taken"] = True
        except UnsafeUrlError as err:
            out.update(html="", status=None, error=str(err))
        except Exception as err:
            out["error"] = (str(err).splitlines() or ["The page could not be loaded."])[0][:200]
        finally:
            try:
                if context:
                    context.close()
            except Exception:
                pass
        return out
