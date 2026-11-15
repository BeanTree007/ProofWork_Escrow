"""Run the Lighthouse CLI and keep its four category scores (0 to 100)."""
from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess

CATEGORIES = {"performance": "performance", "accessibility": "accessibility", "seo": "seo",
              "best-practices": "best_practices"}


def _result(error=None, **scores) -> dict:
    out = {"ran": error is None, "performance": None, "accessibility": None, "seo": None,
           "best_practices": None, "error": error}
    out.update(scores)
    return out


def find_command():
    """LIGHTHOUSE_BIN (may include arguments) wins; otherwise a `lighthouse` on PATH."""
    custom = os.environ.get("LIGHTHOUSE_BIN")
    if custom:
        return shlex.split(custom)
    found = shutil.which("lighthouse")
    return [found] if found else None


def run_lighthouse(url: str, chrome_path: str | None = None, timeout: int = 120, runner=subprocess.run) -> dict:
    """Only call this with a URL that already passed validate_url. Never raises."""
    command = find_command()
    if not command:
        return _result("Lighthouse is not installed (npm install -g lighthouse).")
    flags = os.environ.get("LIGHTHOUSE_CHROME_FLAGS", "--headless=new")
    args = command + [url, "--output=json", "--output-path=stdout", "--quiet",
                      "--only-categories=" + ",".join(CATEGORIES), f"--chrome-flags={flags}"]
    env = dict(os.environ)
    if chrome_path and not env.get("CHROME_PATH"):
        env["CHROME_PATH"] = chrome_path
    try:
        done = runner(args, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return _result(f"Lighthouse did not finish within {timeout} seconds.")
    except OSError as err:
        return _result(f"Lighthouse could not start: {err}"[:200])
    try:
        data = json.loads(done.stdout)
    except (ValueError, TypeError):
        tail = (done.stderr or "").strip().splitlines()[-1:] or ["no output"]
        return _result(f"Lighthouse failed: {tail[0]}"[:200])
    runtime_error = (data.get("runtimeError") or {}).get("message")
    if runtime_error:
        return _result(f"Lighthouse could not audit the page: {runtime_error}"[:200])
    scores = {}
    for key, field in CATEGORIES.items():
        score = ((data.get("categories") or {}).get(key) or {}).get("score")
        scores[field] = round(score * 100) if isinstance(score, (int, float)) and not isinstance(score, bool) else None
    if all(v is None for v in scores.values()):
        return _result("Lighthouse returned no scores.")
    return _result(None, **scores)
