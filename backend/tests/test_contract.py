import copy
import json
import unittest
from pathlib import Path

from app.inspection.contract import empty_report, validate_report

SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "sample-report.json"


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.sample = json.loads(SAMPLE.read_text())

    def test_empty_report_is_valid(self):
        self.assertEqual(validate_report(empty_report("https://example.com")), [])

    def test_sample_report_is_valid(self):
        self.assertEqual(validate_report(self.sample), [])

    def test_missing_and_wrong_types_are_reported(self):
        bad = copy.deepcopy(self.sample)
        del bad["reachability"]["https"]
        bad["metrics"]["lighthouse"]["seo"] = "100"
        bad["requirements"][0]["status"] = "passed"
        problems = validate_report(bad)
        self.assertTrue(any("reachability.https is missing" in p for p in problems))
        self.assertTrue(any("seo has the wrong type" in p for p in problems))
        self.assertTrue(any("status must be one of" in p for p in problems))

    def test_bool_is_not_accepted_as_number(self):
        bad = copy.deepcopy(self.sample)
        bad["reachability"]["status_code"] = True
        self.assertTrue(validate_report(bad))

    def test_scores_must_be_0_to_100(self):
        bad = copy.deepcopy(self.sample)
        bad["metrics"]["lighthouse"]["performance"] = 101
        self.assertTrue(any("between 0 and 100" in p for p in validate_report(bad)))

    def test_screenshot_file_must_be_bare_name(self):
        bad = copy.deepcopy(self.sample)
        bad["screenshots"][0]["file"] = "../secrets.png"
        self.assertTrue(any("bare file name" in p for p in validate_report(bad)))

    def test_report_may_not_contain_decisions(self):
        for key in ("verdict", "recommendation", "approve"):
            bad = copy.deepcopy(self.sample)
            bad["ai_summary"][key] = "release the funds"
            self.assertTrue(any("not allowed" in p for p in validate_report(bad)), key)


if __name__ == "__main__":
    unittest.main()
