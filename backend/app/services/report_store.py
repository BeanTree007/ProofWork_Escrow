"""File-based storage for verification reports, one folder per project.

<data_dir>/<project_id>/report.json   the latest report (contract v1.0, unchanged)
<data_dir>/<project_id>/*.png         the screenshots that report refers to

Each inspection is written to a fresh folder and swapped in only when it finishes, so a
failed run never leaves a half-written report behind.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import threading

PROJECT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SCREENSHOT_FILE = re.compile(r"^[A-Za-z0-9_-]{1,120}\.png$")
REPORT_FILE = "report.json"

_locks: dict = {}
_locks_guard = threading.Lock()


class InspectionBusy(RuntimeError):
    """An inspection for this project is already running."""


def valid_project_id(project_id: str) -> bool:
    return isinstance(project_id, str) and bool(PROJECT_ID.match(project_id))


def valid_screenshot_name(name: str) -> bool:
    return isinstance(name, str) and bool(SCREENSHOT_FILE.match(name))


class ReportStore:
    def __init__(self, data_dir: str):
        self.data_dir = os.path.abspath(data_dir)

    def project_dir(self, project_id: str) -> str:
        if not valid_project_id(project_id):
            raise ValueError("Invalid project id.")
        return os.path.join(self.data_dir, project_id)

    def load(self, project_id: str) -> dict | None:
        path = os.path.join(self.project_dir(project_id), REPORT_FILE)
        try:
            with open(path, encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError:
            return None

    def run(self, project_id: str, inspect) -> dict:
        """Call inspect(output_dir) -> report, then make it the project's current report.

        Raises InspectionBusy if another inspection for the same project is in progress.
        """
        final_dir = self.project_dir(project_id)
        with _locks_guard:
            lock = _locks.setdefault(final_dir, threading.Lock())
        if not lock.acquire(blocking=False):
            raise InspectionBusy("An inspection for this project is already running.")
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            work_dir = tempfile.mkdtemp(prefix=f".{project_id}-", dir=self.data_dir)
            try:
                report = inspect(work_dir)
                with open(os.path.join(work_dir, REPORT_FILE), "w", encoding="utf-8") as handle:
                    json.dump(report, handle, indent=2)
                old_dir = None
                if os.path.isdir(final_dir):
                    old_dir = final_dir + ".old"
                    shutil.rmtree(old_dir, ignore_errors=True)
                    os.replace(final_dir, old_dir)
                os.replace(work_dir, final_dir)
                if old_dir:
                    shutil.rmtree(old_dir, ignore_errors=True)
                return report
            finally:
                shutil.rmtree(work_dir, ignore_errors=True)
        finally:
            lock.release()
