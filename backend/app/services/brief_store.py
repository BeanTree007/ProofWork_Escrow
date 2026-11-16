"""Content-addressed storage for project briefs (the off-chain requirements).

The escrow contract stores only `detailsHash`, the SHA-256 of the canonical brief text
(see `brief_hash`, which must match `computeBriefHash` in frontend/src/lib/projectModel.js).
A brief is stored under its own hash, so a stored brief can never disagree with the
contract and nobody can overwrite another project's brief with different content.

<data_dir>/<hash without 0x>.json   {"description", "pages", "features", "name"}

The project name is display-only: it is not part of the hash, so the first stored
name for a hash is kept.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile

HASH = re.compile(r"^0x[0-9a-f]{64}$")
MAX_DESCRIPTION = 5000
MAX_NAME = 80
MAX_ITEMS = 30
MAX_ITEM_LENGTH = 200


def valid_hash(value: str) -> bool:
    return isinstance(value, str) and bool(HASH.match(value))


def brief_hash(description: str, pages: list[str], features: list[str]) -> str:
    text = f"{description}|{','.join(pages)}|{','.join(features)}"
    return "0x" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def _string_list(value, field: str) -> list[str]:
    if not isinstance(value, list) or not value or len(value) > MAX_ITEMS:
        raise ValueError(f"{field} must be a list of 1 to {MAX_ITEMS} strings.")
    if not all(isinstance(v, str) and 0 < len(v) <= MAX_ITEM_LENGTH for v in value):
        raise ValueError(f"Each item in {field} must be a string of 1 to {MAX_ITEM_LENGTH} characters.")
    return value


def parse_brief(body) -> dict:
    """Validate a request body and return the brief to store. Raises ValueError."""
    if not isinstance(body, dict):
        raise ValueError("Send a JSON object with description, pages and features.")
    description = body.get("description")
    if not isinstance(description, str) or not description.strip() or len(description) > MAX_DESCRIPTION:
        raise ValueError(f"description must be a non-empty string of up to {MAX_DESCRIPTION} characters.")
    name = body.get("name", "")
    if not isinstance(name, str) or len(name) > MAX_NAME:
        raise ValueError(f"name must be a string of up to {MAX_NAME} characters.")
    return {
        "name": name.strip(),
        "description": description,
        "pages": _string_list(body.get("pages"), "pages"),
        "features": _string_list(body.get("features"), "features"),
    }


class BriefStore:
    def __init__(self, data_dir: str):
        self.data_dir = os.path.abspath(data_dir)

    def _path(self, digest: str) -> str:
        if not valid_hash(digest):
            raise ValueError("Invalid brief hash.")
        return os.path.join(self.data_dir, digest[2:] + ".json")

    def load(self, digest: str) -> dict | None:
        try:
            with open(self._path(digest), encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError:
            return None

    def save(self, digest: str, brief: dict) -> tuple[dict, bool]:
        """Store `brief` under `digest`. Returns (stored brief, created).

        Raises ValueError if the brief does not hash to `digest`.
        """
        if brief_hash(brief["description"], brief["pages"], brief["features"]) != digest:
            raise ValueError("The brief does not match the hash. It must be the exact text the contract was created with.")
        existing = self.load(digest)
        if existing is not None:
            return existing, False
        os.makedirs(self.data_dir, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".brief-", dir=self.data_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(brief, handle, indent=2)
            # os.link fails if another request stored the same hash first; keep that one.
            try:
                os.link(tmp, self._path(digest))
                created = True
            except FileExistsError:
                created = False
        finally:
            os.unlink(tmp)
        return self.load(digest), created
