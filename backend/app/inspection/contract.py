"""Verification report contract, version 1.0.

The report is EVIDENCE ONLY. It never contains a verdict, a pass/fail decision or a payment
recommendation: only the client can approve payment. validate_report() enforces that.
"""
from __future__ import annotations

from datetime import datetime, timezone

SCHEMA_VERSION = "1.0"
DISCLAIMER = (
    "This report contains evidence gathered automatically. It does not decide whether "
    "payment is released. Only the client can approve or dispute."
)
REQUIREMENT_KINDS = ("page", "feature")
# not_detected means "nothing found by these checks", not "proven absent".
REQUIREMENT_STATUSES = ("detected", "not_detected", "needs_review")
SUMMARY_SOURCES = ("ai", "template")  # "ai": written by the model named in ai_summary.model
FORBIDDEN_KEYS = {"verdict", "approved", "approve", "reject", "recommendation", "release_payment",
                  "pass", "fail", "payout", "winner", "overall_score", "decision"}


def empty_report(website_url: str) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "website_url": website_url,
        "disclaimer": DISCLAIMER,
        "reachability": {"reachable": False, "final_url": None, "status_code": None,
                         "response_ms": None, "https": False, "error": None},
        "metadata": {"title": None, "description": None, "lang": None, "viewport_meta": False, "open_graph": {}},
        "pages": {"required": [], "discovered": []},
        "contact_form": {"detected": False, "forms": []},
        "screenshots": [],
        "responsiveness": {"checks_run": False, "viewports": []},
        "metrics": {"lighthouse": {"ran": False, "performance": None, "accessibility": None,
                                   "seo": None, "best_practices": None, "error": None}},
        "requirements": [],
        "incomplete_checks": [],
        "ai_summary": {"generated_by": "template", "model": None, "text": "", "error": None},
    }


class L:  # list whose items match `item`
    def __init__(self, item):
        self.item = item


class E:  # one of the given values
    def __init__(self, *values):
        self.values = values


STR, STR_N, BOOL, BOOL_N = (str,), (str, type(None)), (bool,), (bool, type(None))
INT, INT_N, NUM_N, OBJ = (int,), (int, type(None)), (int, float, type(None)), (dict,)

SPEC = {
    "schema_version": E(SCHEMA_VERSION), "generated_at": STR, "website_url": STR, "disclaimer": STR,
    "reachability": {"reachable": BOOL, "final_url": STR_N, "status_code": INT_N, "response_ms": INT_N,
                     "https": BOOL, "error": STR_N},
    "metadata": {"title": STR_N, "description": STR_N, "lang": STR_N, "viewport_meta": BOOL, "open_graph": OBJ},
    "pages": {
        "required": L({"name": STR, "detected": BOOL, "matched_url": STR_N, "method": STR, "evidence": STR}),
        "discovered": L({"url": STR, "title": STR_N}),
    },
    "contact_form": {"detected": BOOL, "forms": L({
        "page_url": STR, "action": STR_N, "method": STR,
        "fields": L({"name": STR_N, "type": STR}),
        "has_email_field": BOOL, "has_message_field": BOOL, "has_submit": BOOL})},
    "screenshots": L({"label": STR, "viewport": {"width": INT, "height": INT}, "page_url": STR,
                      "file": STR_N, "taken": BOOL, "error": STR_N}),
    "responsiveness": {"checks_run": BOOL, "viewports": L({
        "name": STR, "width": INT, "height": INT, "horizontal_overflow": BOOL_N,
        "viewport_meta": BOOL_N, "error": STR_N})},
    "metrics": {"lighthouse": {"ran": BOOL, "performance": NUM_N, "accessibility": NUM_N, "seo": NUM_N,
                               "best_practices": NUM_N, "error": STR_N}},
    "requirements": L({"id": STR, "kind": E(*REQUIREMENT_KINDS), "text": STR,
                       "status": E(*REQUIREMENT_STATUSES), "method": STR, "evidence": STR}),
    "incomplete_checks": L({"check": STR, "reason": STR}),
    "ai_summary": {"generated_by": E(*SUMMARY_SOURCES), "model": STR_N, "text": STR, "error": STR_N},
}


def _check(value, spec, path, problems):
    if isinstance(spec, dict):
        if not isinstance(value, dict):
            problems.append(f"{path} must be an object")
            return
        for key, sub in spec.items():
            if key not in value:
                problems.append(f"{path}.{key} is missing")
            else:
                _check(value[key], sub, f"{path}.{key}", problems)
    elif isinstance(spec, L):
        if not isinstance(value, list):
            problems.append(f"{path} must be a list")
            return
        for i, item in enumerate(value):
            _check(item, spec.item, f"{path}[{i}]", problems)
    elif isinstance(spec, E):
        if value not in spec.values:
            problems.append(f"{path} must be one of {list(spec.values)}")
    else:  # tuple of types; bool only counts where explicitly allowed
        if not isinstance(value, spec) or (isinstance(value, bool) and bool not in spec):
            problems.append(f"{path} has the wrong type")


def _forbidden(value, path, problems):
    if isinstance(value, dict):
        for k, v in value.items():
            if path != "report.metadata.open_graph" and str(k).lower() in FORBIDDEN_KEYS:
                problems.append(f"{path}.{k} is not allowed: the report holds evidence, not decisions")
            _forbidden(v, f"{path}.{k}", problems)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _forbidden(v, f"{path}[{i}]", problems)


def validate_report(report) -> list:
    """Return a list of problems; an empty list means the report matches the contract."""
    problems = []
    _check(report, SPEC, "report", problems)
    if problems:
        return problems
    for name, score in report["metrics"]["lighthouse"].items():
        if name in ("performance", "accessibility", "seo", "best_practices") and score is not None and not 0 <= score <= 100:
            problems.append(f"report.metrics.lighthouse.{name} must be between 0 and 100")
    for i, shot in enumerate(report["screenshots"]):
        f = shot["file"]
        if f is not None and ("/" in f or "\\" in f or f.startswith(".")):
            problems.append(f"report.screenshots[{i}].file must be a bare file name")
    _forbidden(report, "report", problems)
    return problems
