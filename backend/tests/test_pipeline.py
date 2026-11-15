import os
import tempfile
import unittest
from unittest import mock

from app.inspection import fetcher
from app.inspection.browser import Browser, BrowserUnavailable
from app.inspection.contract import validate_report
from app.inspection.fetcher import fetch
from app.inspection.pipeline import inspect_website, normalize_requirements
from app.inspection.url_safety import UnsafeUrlError

from local_site import serve

REQUIREMENTS = {"pages": ["Home", "About", "Menu", "Contact", "Gallery", "Pricing"],
                "features": ["Contact form", "Mobile layout", "Online ordering", "Loyalty rewards", "Newsletter signup"]}


def block_private_path(url, **kwargs):
    if "private" in url:
        raise UnsafeUrlError("The URL points to a private or internal address and cannot be inspected.")
    return url


def browser_available() -> bool:
    try:
        with Browser(allow_private=True):
            return True
    except BrowserUnavailable:
        return False


HAS_BROWSER = browser_available()


class FetcherTests(unittest.TestCase):
    def test_fetch_and_status(self):
        with serve() as base:
            ok = fetch(base + "/", allow_private=True)
            self.assertEqual(ok["status"], 200)
            self.assertIn("Sunrise Bakery", ok["html"])
            self.assertEqual(fetch(base + "/missing.html", allow_private=True)["status"], 404)

    def test_private_address_is_refused_by_default(self):
        with serve() as base:
            out = fetch(base + "/")
            self.assertIsNone(out["status"])
            self.assertEqual(out["html"], "")
            self.assertIn("Only the standard web ports", out["error"])

    def test_redirect_to_blocked_url_is_not_followed(self):
        with serve() as base, mock.patch.object(fetcher, "validate_url", block_private_path):
            out = fetch(base + "/redirect-to-private")
        self.assertIsNone(out["status"])
        self.assertNotIn("internal-only-data", out["html"])
        self.assertIn("private", out["error"])

    def test_redirect_loop_and_dead_host(self):
        with serve() as base:
            self.assertIn("too many times", fetch(base + "/loop", allow_private=True)["error"])
        dead = fetch("http://127.0.0.1:9/", allow_private=True, timeout=2)
        self.assertIsNone(dead["status"])
        self.assertIn("could not be reached", dead["error"])


@unittest.skipUnless(HAS_BROWSER, "Playwright browser is not installed")
class BrowserTests(unittest.TestCase):
    def test_capture_measures_and_screenshots(self):
        with serve() as base, tempfile.TemporaryDirectory() as out, Browser(allow_private=True) as browser:
            path = os.path.join(out, "shot.png")
            mobile = browser.capture(base + "/", 390, 844, path)
            desktop = browser.capture(base + "/", 1440, 900)
            self.assertTrue(mobile["shot_taken"])
            self.assertGreater(os.path.getsize(path), 1000)
            self.assertTrue(mobile["horizontal_overflow"])
            self.assertFalse(desktop["horizontal_overflow"])
            self.assertIn("Loyalty rewards", desktop["html"], "rendered HTML includes script-added text")

    def test_redirect_to_blocked_url_returns_no_content(self):
        with serve() as base, Browser(validator=block_private_path) as browser:
            out = browser.capture(base + "/redirect-to-private", 1440, 900)
            direct = browser.capture(base + "/private.html", 1440, 900)
        for result in (out, direct):
            self.assertNotIn("internal-only-data", result["html"])
            self.assertTrue(result["error"])
            self.assertFalse(result["shot_taken"])


class PipelineTests(unittest.TestCase):
    def test_requirements_input_shapes(self):
        self.assertEqual(normalize_requirements(["A", " a ", "", "B"]), ([], ["A", "B"]))
        self.assertEqual(normalize_requirements({"pages": ["Home"], "features": None}), (["Home"], []))
        self.assertEqual(normalize_requirements(None), ([], []))

    def test_unsafe_and_unreachable_urls_produce_valid_reports(self):
        for url in ["http://localhost/", "file:///etc/passwd", "", None, "http://169.254.169.254/latest"]:
            report = inspect_website(url, REQUIREMENTS, api_key="")
            self.assertEqual(validate_report(report), [])
            self.assertFalse(report["reachability"]["reachable"])
            self.assertTrue(report["reachability"]["error"])
            self.assertEqual({r["status"] for r in report["requirements"]}, {"needs_review"})
            self.assertEqual({c["check"] for c in report["incomplete_checks"]},
                             {"pages", "contact_form", "screenshots", "responsiveness", "lighthouse"})
        dead = inspect_website("http://127.0.0.1:9/", ["Contact form"], allow_private_hosts=True, api_key="")
        self.assertFalse(dead["reachability"]["reachable"])
        with serve() as base:
            missing = inspect_website(base + "/missing.html", [], allow_private_hosts=True, api_key="")
        self.assertEqual((missing["reachability"]["reachable"], missing["reachability"]["status_code"]), (False, 404))

    def test_without_browser_static_checks_still_run(self):
        def unavailable(self):
            raise BrowserUnavailable("Playwright is not installed.")
        with serve() as base, mock.patch.object(Browser, "__enter__", unavailable):
            report = inspect_website(base + "/", REQUIREMENTS, allow_private_hosts=True, run_lighthouse=False, api_key="")
        self.assertEqual(validate_report(report), [])
        rows = {r["text"]: r for r in report["requirements"]}
        self.assertEqual(rows["About"]["status"], "detected")
        self.assertEqual(rows["Contact form"]["status"], "detected")
        self.assertEqual(rows["Mobile layout"]["status"], "needs_review", "no browser, so a person must check")
        self.assertEqual(rows["Loyalty rewards"]["status"], "not_detected", "script-added text is invisible without a browser")
        self.assertFalse(report["responsiveness"]["checks_run"])
        self.assertEqual({c["check"] for c in report["incomplete_checks"]}, {"screenshots", "responsiveness", "lighthouse"})
        self.assertEqual(report["screenshots"], [])

    @unittest.skipUnless(HAS_BROWSER, "Playwright browser is not installed")
    def test_full_inspection_of_local_site(self):
        with serve() as base, tempfile.TemporaryDirectory() as out:
            report = inspect_website(base + "/", REQUIREMENTS, out, allow_private_hosts=True,
                                     run_lighthouse=False, api_key="")
            files = set(os.listdir(out))
        self.assertEqual(validate_report(report), [])
        self.assertTrue(report["reachability"]["reachable"])
        self.assertFalse(report["reachability"]["https"])
        self.assertEqual(report["metadata"]["title"], "Sunrise Bakery")
        rows = {r["text"]: r for r in report["requirements"]}
        self.assertEqual({k: rows[k]["status"] for k in REQUIREMENTS["pages"]},
                         {"Home": "detected", "About": "detected", "Menu": "detected", "Contact": "detected",
                          "Gallery": "not_detected", "Pricing": "not_detected"})
        self.assertIn("404", rows["Gallery"]["evidence"], "the Gallery link exists but is broken")
        self.assertEqual(rows["Contact form"]["status"], "detected")
        self.assertEqual(rows["Mobile layout"]["status"], "needs_review", "the fixture overflows at phone width")
        self.assertEqual(rows["Online ordering"]["status"], "needs_review")
        self.assertEqual(rows["Loyalty rewards"]["status"], "needs_review", "found in rendered HTML")
        self.assertEqual(rows["Newsletter signup"]["status"], "not_detected")
        self.assertTrue(report["contact_form"]["detected"])
        views = {v["name"]: v["horizontal_overflow"] for v in report["responsiveness"]["viewports"]}
        self.assertEqual(views, {"Desktop": False, "Tablet": True, "Mobile": True})
        taken = {s["file"] for s in report["screenshots"] if s["taken"]}
        self.assertTrue({"home-desktop.png", "home-tablet.png", "home-mobile.png", "contact-desktop.png"} <= taken)
        self.assertTrue(taken <= files)
        self.assertEqual([c["check"] for c in report["incomplete_checks"]], ["lighthouse"])
        self.assertEqual(report["ai_summary"]["generated_by"], "template")
        self.assertNotIn("IGNORE ALL PREVIOUS", report["ai_summary"]["text"])


if __name__ == "__main__":
    unittest.main()
