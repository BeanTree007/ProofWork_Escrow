from flask import Blueprint, current_app, jsonify, request, send_from_directory

from ..inspection.pipeline import inspect_website
from ..services.brief_store import BriefStore, parse_brief, valid_hash
from ..services.report_store import InspectionBusy, ReportStore, valid_project_id, valid_screenshot_name

api = Blueprint("api", __name__)

MAX_LIST_ITEMS = 30
MAX_ITEM_LENGTH = 200


def _store() -> ReportStore:
    return ReportStore(current_app.config["REPORTS_DIR"])


def _error(message: str, status: int):
    return jsonify({"error": message}), status


def _string_list(value, field: str):
    if value is None:
        return [], None
    if not isinstance(value, list) or len(value) > MAX_LIST_ITEMS:
        return None, f"{field} must be a list of up to {MAX_LIST_ITEMS} strings."
    if not all(isinstance(v, str) and len(v) <= MAX_ITEM_LENGTH for v in value):
        return None, f"Each item in {field} must be a string of up to {MAX_ITEM_LENGTH} characters."
    return value, None


@api.get("/health")
def health():
    return jsonify({"status": "ok"})


@api.post("/projects/<project_id>/inspection")
def run_inspection(project_id):
    """Inspect the submitted website and store the evidence report.

    Body: {"website_url": "...", "pages": [...], "features": [...]}
    Returns the report exactly as the inspector produced it (docs/report-contract.md).
    """
    if not valid_project_id(project_id):
        return _error("Invalid project id.", 400)
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _error("Send a JSON object with website_url, pages and features.", 400)
    url = body.get("website_url")
    if not isinstance(url, str) or not url.strip() or len(url) > 2048:
        return _error("website_url must be a URL of up to 2048 characters.", 400)
    pages, problem = _string_list(body.get("pages"), "pages")
    if problem:
        return _error(problem, 400)
    features, problem = _string_list(body.get("features"), "features")
    if problem:
        return _error(problem, 400)

    config = current_app.config
    try:
        report = _store().run(project_id, lambda out: inspect_website(
            url, {"pages": pages, "features": features}, out,
            allow_private_hosts=config["INSPECTOR_ALLOW_PRIVATE_HOSTS"],
            run_lighthouse=config["INSPECTOR_RUN_LIGHTHOUSE"]))
    except InspectionBusy as err:
        return _error(str(err), 409)
    return jsonify(report)


@api.get("/projects/<project_id>/report")
def get_report(project_id):
    if not valid_project_id(project_id):
        return _error("Invalid project id.", 400)
    report = _store().load(project_id)
    if report is None:
        return _error("No verification report exists for this project yet.", 404)
    return jsonify(report)


@api.get("/projects/<project_id>/screenshots/<name>")
def get_screenshot(project_id, name):
    if not valid_project_id(project_id) or not valid_screenshot_name(name):
        return _error("Screenshot not found.", 404)
    response = send_from_directory(_store().project_dir(project_id), name, mimetype="image/png", max_age=60)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@api.put("/briefs/<digest>")
def put_brief(digest):
    """Store a project brief under its SHA-256 (the contract's detailsHash).

    Body: {"name": "...", "description": "...", "pages": [...], "features": [...]}
    201 when stored, 200 when the same brief was already stored, 400 if it does not hash to <digest>.
    """
    if not valid_hash(digest):
        return _error("The brief hash must be 0x followed by 64 lowercase hex characters.", 400)
    try:
        brief = parse_brief(request.get_json(silent=True))
        stored, created = BriefStore(current_app.config["BRIEFS_DIR"]).save(digest, brief)
    except ValueError as err:
        return _error(str(err), 400)
    return jsonify(stored), 201 if created else 200


@api.get("/briefs/<digest>")
def get_brief(digest):
    if not valid_hash(digest):
        return _error("The brief hash must be 0x followed by 64 lowercase hex characters.", 400)
    brief = BriefStore(current_app.config["BRIEFS_DIR"]).load(digest)
    if brief is None:
        return _error("No brief is stored for this hash.", 404)
    return jsonify(brief)


@api.route("/projects", methods=["GET", "POST"])
@api.get("/projects/<project_id>")
@api.post("/projects/<project_id>/submission")
@api.route("/projects/<project_id>/extensions", methods=["GET", "POST"])
def project_placeholder(project_id=None):
    # TODO: Define authenticated request/response schemas and connect services.
    return jsonify({"error": "Project API is not implemented"}), 501
