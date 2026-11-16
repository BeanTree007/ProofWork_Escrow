import json
import os
import tempfile
import threading
import unittest
from unittest import mock

from app import create_app
from app.inspection.contract import validate_report
from app.services.brief_store import brief_hash
from app.services.report_store import InspectionBusy, ReportStore

from local_site import serve

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "sample-report.json")
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def fake_inspect(url, requirements, output_dir, **kwargs):
    with open(SAMPLE, encoding="utf-8") as handle:
        report = json.load(handle)
    report["website_url"] = url
    for shot in report["screenshots"]:
        with open(os.path.join(output_dir, shot["file"]), "wb") as handle:
            handle.write(PNG)
    return report


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app({"REPORTS_DIR": self.tmp.name, "INSPECTOR_ALLOW_PRIVATE_HOSTS": False,
                               "INSPECTOR_RUN_LIGHTHOUSE": False})
        self.client = self.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()


class ApiSkeletonTests(ApiTestCase):
    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})

    def test_unbuilt_project_endpoints_fail_explicitly(self):
        endpoints = [
            ("get", "/api/projects"),
            ("post", "/api/projects"),
            ("get", "/api/projects/123"),
            ("post", "/api/projects/123/submission"),
            ("get", "/api/projects/123/extensions"),
            ("post", "/api/projects/123/extensions"),
        ]
        for method, path in endpoints:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path)
                self.assertEqual(response.status_code, 501)
                self.assertEqual(response.get_json()["error"], "Project API is not implemented")


class ReportApiTests(ApiTestCase):
    def post(self, body, project="7"):
        return self.client.post(f"/api/projects/{project}/inspection", json=body)

    def test_report_missing_returns_404(self):
        response = self.client.get("/api/projects/7/report")
        self.assertEqual(response.status_code, 404)
        self.assertIn("No verification report", response.get_json()["error"])

    def test_inspection_stores_and_serves_report(self):
        with mock.patch("app.routes.inspect_website", side_effect=fake_inspect) as inspect:
            response = self.post({"website_url": "https://example.com", "pages": ["Home"], "features": ["Contact form"]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(validate_report(response.get_json()), [])
        args, kwargs = inspect.call_args
        self.assertEqual(args[1], {"pages": ["Home"], "features": ["Contact form"]})
        self.assertFalse(kwargs["allow_private_hosts"])

        stored = self.client.get("/api/projects/7/report")
        self.assertEqual(stored.status_code, 200)
        self.assertEqual(stored.get_json(), response.get_json())

        shot = self.client.get("/api/projects/7/screenshots/home-desktop.png")
        self.assertEqual(shot.status_code, 200)
        self.assertEqual(shot.mimetype, "image/png")
        self.assertEqual(shot.get_data(), PNG)
        shot.close()

    def test_rerun_replaces_old_screenshots(self):
        with mock.patch("app.routes.inspect_website", side_effect=fake_inspect):
            self.post({"website_url": "https://example.com"})
        stale = os.path.join(self.tmp.name, "7", "stale.png")
        with open(stale, "wb") as handle:
            handle.write(PNG)
        with mock.patch("app.routes.inspect_website", side_effect=fake_inspect):
            self.post({"website_url": "https://example.org"})
        self.assertFalse(os.path.exists(stale))
        self.assertEqual(self.client.get("/api/projects/7/report").get_json()["website_url"], "https://example.org")

    def test_failed_inspection_keeps_previous_report(self):
        with mock.patch("app.routes.inspect_website", side_effect=fake_inspect):
            self.post({"website_url": "https://example.com"})
        self.app.config["PROPAGATE_EXCEPTIONS"] = False
        with mock.patch("app.routes.inspect_website", side_effect=RuntimeError("boom")):
            self.assertEqual(self.post({"website_url": "https://example.org"}).status_code, 500)
        self.assertEqual(self.client.get("/api/projects/7/report").get_json()["website_url"], "https://example.com")
        self.assertEqual([n for n in os.listdir(self.tmp.name) if n.startswith(".")], [])

    def test_bad_input_is_rejected(self):
        cases = [
            None,
            {"pages": ["Home"]},
            {"website_url": ""},
            {"website_url": "x" * 2049},
            {"website_url": "https://example.com", "pages": "Home"},
            {"website_url": "https://example.com", "features": [1]},
            {"website_url": "https://example.com", "features": ["x"] * 31},
        ]
        with mock.patch("app.routes.inspect_website") as inspect:
            for body in cases:
                with self.subTest(body=body):
                    response = self.client.post("/api/projects/7/inspection", data=json.dumps(body),
                                                content_type="application/json")
                    self.assertEqual(response.status_code, 400)
            inspect.assert_not_called()

    def test_invalid_ids_and_file_names(self):
        self.assertEqual(self.client.get("/api/projects/a.b/report").status_code, 400)
        self.assertEqual(self.post({"website_url": "https://example.com"}, project="a.b").status_code, 400)
        for name in ("..%2Freport.json", "report.json", ".hidden.png", "missing.png"):
            with self.subTest(name=name):
                self.assertEqual(self.client.get(f"/api/projects/7/screenshots/{name}").status_code, 404)

    def test_private_hosts_are_blocked_by_default(self):
        response = self.post({"website_url": "http://127.0.0.1/", "pages": ["Home"]})
        self.assertEqual(response.status_code, 200)
        report = response.get_json()
        self.assertFalse(report["reachability"]["reachable"])
        self.assertIn("private", report["reachability"]["error"])
        self.assertEqual(report["requirements"][0]["status"], "needs_review")

    def test_real_inspection_of_local_site(self):
        self.app.config["INSPECTOR_ALLOW_PRIVATE_HOSTS"] = True
        with serve() as base:
            response = self.post({"website_url": base + "/", "pages": ["Home", "Contact"], "features": ["Contact form"]})
        self.assertEqual(response.status_code, 200)
        report = response.get_json()
        self.assertEqual(validate_report(report), [])
        self.assertTrue(report["reachability"]["reachable"])
        for shot in report["screenshots"]:
            if shot["taken"]:
                res = self.client.get(f"/api/projects/7/screenshots/{shot['file']}")
                self.assertEqual(res.status_code, 200)
                res.close()


BRIEF = {"name": "Bakery site", "description": "A five page marketing site for a bakery.",
         "pages": ["Home", "Menü"], "features": ["Contact form"]}
# SHA-256 of "A five page marketing site for a bakery.|Home,Menü|Contact form", the same text
# computeBriefHash builds in frontend/src/lib/projectModel.js.
BRIEF_HASH = brief_hash(BRIEF["description"], BRIEF["pages"], BRIEF["features"])


class BriefApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.app.config["BRIEFS_DIR"] = os.path.join(self.tmp.name, "briefs")

    def test_hash_matches_frontend_format(self):
        import hashlib
        text = "A five page marketing site for a bakery.|Home,Menü|Contact form"
        self.assertEqual(BRIEF_HASH, "0x" + hashlib.sha256(text.encode()).hexdigest())

    def test_store_and_fetch(self):
        self.assertEqual(self.client.get(f"/api/briefs/{BRIEF_HASH}").status_code, 404)
        created = self.client.put(f"/api/briefs/{BRIEF_HASH}", json=BRIEF)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.get_json(), BRIEF)
        self.assertEqual(self.client.get(f"/api/briefs/{BRIEF_HASH}").get_json(), BRIEF)

    def test_repeat_store_keeps_first_name(self):
        self.client.put(f"/api/briefs/{BRIEF_HASH}", json=BRIEF)
        again = self.client.put(f"/api/briefs/{BRIEF_HASH}", json={**BRIEF, "name": "Other"})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.get_json()["name"], "Bakery site")

    def test_brief_must_match_hash(self):
        response = self.client.put(f"/api/briefs/{BRIEF_HASH}", json={**BRIEF, "pages": ["Home"]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("does not match", response.get_json()["error"])
        self.assertEqual(self.client.get(f"/api/briefs/{BRIEF_HASH}").status_code, 404)

    def test_bad_input_is_rejected(self):
        for digest in ("abc", "0x" + "A" * 64, "0x" + "a" * 63):
            with self.subTest(digest=digest):
                self.assertEqual(self.client.get(f"/api/briefs/{digest}").status_code, 400)
                self.assertEqual(self.client.put(f"/api/briefs/{digest}", json=BRIEF).status_code, 400)
        for body in (None, {**BRIEF, "description": ""}, {**BRIEF, "pages": []}, {**BRIEF, "features": [3]},
                     {**BRIEF, "name": 5}, {**BRIEF, "pages": ["x"] * 31}):
            with self.subTest(body=body):
                response = self.client.put(f"/api/briefs/{BRIEF_HASH}", data=json.dumps(body),
                                           content_type="application/json")
                self.assertEqual(response.status_code, 400)


class ReportStoreTests(unittest.TestCase):
    def test_concurrent_run_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = ReportStore(tmp)
            started, release = threading.Event(), threading.Event()

            def slow(out):
                started.set()
                release.wait(5)
                return {"ok": True}

            thread = threading.Thread(target=store.run, args=("p1", slow))
            thread.start()
            started.wait(5)
            with self.assertRaises(InspectionBusy):
                store.run("p1", lambda out: {})
            self.assertEqual(store.run("p2", lambda out: {"other": True}), {"other": True})
            release.set()
            thread.join(5)
            self.assertEqual(store.load("p1"), {"ok": True})


if __name__ == "__main__":
    unittest.main()
