import json
import os
import subprocess
import unittest
from types import SimpleNamespace
from unittest import mock

from app.inspection.lighthouse import run_lighthouse

LHR = {"categories": {"performance": {"score": 0.87}, "accessibility": {"score": 0.915}, "seo": {"score": 1},
                      "best-practices": {"score": None}}}


def runner(stdout="", stderr=""):
    return lambda args, **kw: SimpleNamespace(stdout=stdout, stderr=stderr, returncode=0)


class LighthouseTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.dict(os.environ, {"LIGHTHOUSE_BIN": "lighthouse-test-bin"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_scores_are_scaled_to_100(self):
        out = run_lighthouse("https://example.com", runner=runner(json.dumps(LHR)))
        self.assertEqual(out, {"ran": True, "performance": 87, "accessibility": 92, "seo": 100,
                               "best_practices": None, "error": None})

    def test_command_and_chrome_path(self):
        seen = {}

        def run(args, **kw):
            seen.update(args=args, env=kw["env"])
            return SimpleNamespace(stdout=json.dumps(LHR), stderr="")
        with mock.patch.dict(os.environ, {"CHROME_PATH": ""}):
            run_lighthouse("https://example.com", chrome_path="/opt/chrome", runner=run)
        self.assertEqual(seen["args"][:2], ["lighthouse-test-bin", "https://example.com"])
        self.assertEqual(seen["env"]["CHROME_PATH"], "/opt/chrome")

    def test_failures_are_reported_not_raised(self):
        def timeout(args, **kw):
            raise subprocess.TimeoutExpired(args, 1)

        def missing(args, **kw):
            raise FileNotFoundError("no such file")
        cases = [runner("not json", "Error: Chrome not found"), runner(json.dumps({"runtimeError": {"message": "NO_FCP"}})),
                 runner(json.dumps({"categories": {}})), timeout, missing]
        for case in cases:
            out = run_lighthouse("https://example.com", runner=case)
            self.assertFalse(out["ran"])
            self.assertTrue(out["error"])
            self.assertIsNone(out["performance"])

    def test_not_installed(self):
        with mock.patch.dict(os.environ, {"LIGHTHOUSE_BIN": "", "PATH": ""}):
            out = run_lighthouse("https://example.com")
        self.assertFalse(out["ran"])
        self.assertIn("not installed", out["error"])


if __name__ == "__main__":
    unittest.main()
