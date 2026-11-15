"""The inspection pipeline: URL checks, browser evidence, HTML analysis, Lighthouse, summary.

inspect_website() gathers evidence and returns a report that matches contract.py. It never
decides whether work is acceptable and never touches escrow.
"""
from __future__ import annotations

import os

from . import lighthouse as lighthouse_stage
from .browser import VIEWPORTS, Browser, BrowserUnavailable
from .contract import empty_report, validate_report
from .fetcher import fetch
from .html_analyzer import detect_pages, internal_links, is_contact_form, match_requirements, parse_html, slugify
from .summary import summarize
from .url_safety import UnsafeUrlError, validate_url

MAX_ITEMS = 30          # required pages or features considered
MAX_PAGE_VISITS = 8     # matched pages loaded besides the home page
MAX_PAGE_SHOTS = 4      # of those, how many get a desktop screenshot
STAGES = ("screenshots", "responsiveness", "lighthouse")


def _clean(values) -> list:
    out, seen = [], set()
    for value in values or []:
        text = " ".join(str(value).split())[:200]
        if text and text.lower() not in seen:
            seen.add(text.lower())
            out.append(text)
    return out[:MAX_ITEMS]


def normalize_requirements(requirements) -> tuple:
    """Accepts {"pages": [...], "features": [...]} or a plain list of feature strings."""
    if isinstance(requirements, dict):
        return _clean(requirements.get("pages")), _clean(requirements.get("features"))
    return [], _clean(requirements)


def _items(kind: str, texts: list) -> list:
    out, used = [], set()
    for text in texts:
        base = f"{kind}-{slugify(text) or 'item'}"
        item_id, n = base, 2
        while item_id in used:
            item_id, n = f"{base}-{n}", n + 1
        used.add(item_id)
        out.append({"id": item_id, "kind": kind, "text": text})
    return out


def _not_inspected(report: dict, pages: list, features: list, message: str, api_key) -> dict:
    report["reachability"]["error"] = message
    for item in _items("page", pages) + _items("feature", features):
        report["requirements"].append({**item, "status": "needs_review", "method": "not_inspected",
                                       "evidence": "The site could not be inspected, so this was not checked."})
    for check in ("pages", "contact_form") + STAGES:
        report["incomplete_checks"].append({"check": check, "reason": "The site could not be inspected."})
    report["ai_summary"] = summarize(report, api_key=api_key)
    return _finish(report)


def _finish(report: dict) -> dict:
    problems = validate_report(report)
    if problems:  # a bug in this pipeline, not a problem with the inspected site
        raise RuntimeError("Inspection produced an invalid report: " + "; ".join(problems[:5]))
    return report


def inspect_website(website_url: str, requirements, output_dir: str | None = None, *,
                    allow_private_hosts: bool = False, run_lighthouse: bool = True,
                    api_key: str | None = None) -> dict:
    """Inspect a submitted website and return the evidence report (see docs/report-contract.md).

    requirements: {"pages": [...], "features": [...]} or a list of feature strings.
    output_dir: folder for screenshots; they are skipped when it is not given.
    allow_private_hosts: local development and tests only. Never set it from request data.
    api_key: Anthropic key for the summary; defaults to the ANTHROPIC_API_KEY environment variable.
    """
    pages, features = normalize_requirements(requirements)
    report = empty_report(str(website_url or "").strip()[:2048])
    try:
        url = validate_url(website_url, allow_private=allow_private_hosts)
    except UnsafeUrlError as err:
        return _not_inspected(report, pages, features, str(err), api_key)

    # 1. Reachability, with every redirect hop validated.
    home = fetch(url, allow_private=allow_private_hosts)
    reachable = home["status"] is not None and home["status"] < 400
    report["reachability"].update(final_url=home["url"], status_code=home["status"], response_ms=home["ms"],
                                  https=home["url"].lower().startswith("https://"), reachable=reachable)
    if not reachable:
        reason = home["error"] or f"The site answered with status {home['status']}."
        return _not_inspected(report, pages, features, reason, api_key)
    base_url = home["url"]
    incomplete = []

    # 2. Browser evidence for the home page: rendered HTML, screenshots, responsive measurements.
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    else:
        incomplete.append({"check": "screenshots", "reason": "No output folder was given, so screenshots were not saved."})
    browser, chrome_path = None, None
    try:
        browser = Browser(allow_private=allow_private_hosts).__enter__()
        chrome_path = browser.executable_path
    except BrowserUnavailable as err:
        reason = str(err)
        incomplete += [{"check": c, "reason": reason} for c in ("screenshots", "responsiveness")
                       if not (c == "screenshots" and not output_dir)]

    def shoot(page_url: str, label: str, name: str, width: int, height: int) -> dict:
        file = f"{slugify(label) or 'page'}-{name.lower()}.png"
        result = browser.capture(page_url, width, height, os.path.join(output_dir, file) if output_dir else None)
        if output_dir:
            report["screenshots"].append({
                "label": f"{label}, {name.lower()}", "viewport": {"width": width, "height": height},
                "page_url": result["url"], "file": file if result["shot_taken"] else None,
                "taken": result["shot_taken"], "error": None if result["shot_taken"] else (result["error"] or "The screenshot was not taken.")})
        return result

    try:
        home_html = home["html"]
        if browser:
            for name, width, height in VIEWPORTS:
                result = shoot(base_url, "Home", name, width, height)
                report["responsiveness"]["viewports"].append({
                    "name": name, "width": width, "height": height,
                    "horizontal_overflow": result["horizontal_overflow"],
                    "viewport_meta": result["viewport_meta"], "error": result["error"]})
                if name == "Desktop" and result["html"]:
                    home_html = result["html"]  # rendered HTML sees content that scripts add
            measured = [v for v in report["responsiveness"]["viewports"] if v["horizontal_overflow"] is not None]
            report["responsiveness"]["checks_run"] = bool(measured)
            if not measured:
                incomplete.append({"check": "responsiveness", "reason": "The browser could not load the page at any screen size."})

        # 3. HTML analysis of the home page, then of each matched required page.
        home_doc = parse_html(home_html, base_url)
        report["metadata"] = {k: home_doc[k] for k in ("title", "description", "lang", "viewport_meta", "open_graph")}
        links = internal_links(home_doc["links"], base_url)
        docs = {base_url: home_doc}
        statuses = {}
        matched = [p["matched_url"] for p in detect_pages(pages, base_url, links)
                   if p["matched_url"] and p["method"] != "submitted_url"]
        shots = 0
        for page_url in list(dict.fromkeys(matched))[:MAX_PAGE_VISITS]:
            label = next((l["text"] for l in links if l["href"] == page_url and l["text"]), "Page")[:40]
            if browser and shots < MAX_PAGE_SHOTS:
                shots += 1
                name, width, height = VIEWPORTS[0]
                result = shoot(page_url, label, name, width, height)
            else:
                result = fetch(page_url, allow_private=allow_private_hosts)
            statuses[page_url] = result["status"]
            if result["status"] is not None and result["status"] < 400 and result["html"]:
                docs[page_url] = parse_html(result["html"], page_url)
    finally:
        if browser:
            browser.__exit__(None, None, None)

    required = detect_pages(pages, base_url, links, statuses)
    report["pages"]["required"] = required
    discovered = [{"url": u, "title": d["title"]} for u, d in docs.items()]
    discovered += [{"url": l["href"], "title": None} for l in links if l["href"] not in docs]
    report["pages"]["discovered"] = discovered[:25]

    forms = [f for d in docs.values() for f in d["forms"]]
    forms.sort(key=lambda f: not is_contact_form(f))
    report["contact_form"] = {"detected": any(is_contact_form(f) for f in forms), "forms": forms[:10]}

    # 4. Lighthouse.
    if run_lighthouse:
        report["metrics"]["lighthouse"] = lighthouse_stage.run_lighthouse(base_url, chrome_path=chrome_path)
    else:
        report["metrics"]["lighthouse"]["error"] = "Lighthouse was turned off for this inspection."
    if not report["metrics"]["lighthouse"]["ran"]:
        incomplete.append({"check": "lighthouse", "reason": report["metrics"]["lighthouse"]["error"]})

    # 5. Requirement checklist: one row per required page and per required feature.
    rows = [{**item, "status": "detected" if page["detected"] else "not_detected",
             "method": page["method"], "evidence": page["evidence"]}
            for item, page in zip(_items("page", pages), required)]
    texts = {u: d["text"] for u, d in docs.items()}
    rows += match_requirements(_items("feature", features), forms, texts, report["responsiveness"], report["metadata"])
    report["requirements"] = rows
    report["incomplete_checks"] = incomplete

    # 6. Summary of the evidence. It describes; it never decides.
    report["ai_summary"] = summarize(report, api_key=api_key)
    return _finish(report)
