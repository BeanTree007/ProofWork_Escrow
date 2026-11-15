"""Run an inspection from the command line:

    python -m app.inspection https://example.com --pages "Home,About,Contact" \
        --features "Contact form,Mobile layout" --out ./inspection-output
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from .pipeline import inspect_website


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.inspection", description="Inspect a website and write an evidence report.")
    parser.add_argument("url")
    parser.add_argument("--pages", default="", help="comma-separated required pages")
    parser.add_argument("--features", default="", help="comma-separated required features")
    parser.add_argument("--out", help="folder for report.json and screenshots (prints the report if omitted)")
    parser.add_argument("--no-lighthouse", action="store_true", help="skip the Lighthouse stage")
    parser.add_argument("--allow-local", action="store_true",
                        help="DEVELOPMENT ONLY: allow localhost and private addresses")
    args = parser.parse_args(argv)
    split = lambda text: [part.strip() for part in text.split(",") if part.strip()]
    report = inspect_website(args.url, {"pages": split(args.pages), "features": split(args.features)}, args.out,
                             allow_private_hosts=args.allow_local, run_lighthouse=not args.no_lighthouse)
    text = json.dumps(report, indent=2)
    if args.out:
        path = os.path.join(args.out, "report.json")
        os.makedirs(args.out, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        print(f"Report written to {path}")
        print(report["ai_summary"]["text"])
        for check in report["incomplete_checks"]:
            print(f"Not checked: {check['check']} ({check['reason']})")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
