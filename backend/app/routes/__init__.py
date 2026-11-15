from flask import Blueprint, jsonify

api = Blueprint("api", __name__)


@api.get("/health")
def health():
    return jsonify({"status": "ok"})


@api.route("/projects", methods=["GET", "POST"])
@api.get("/projects/<project_id>")
@api.post("/projects/<project_id>/submission")
@api.post("/projects/<project_id>/inspection")
@api.get("/projects/<project_id>/report")
@api.route("/projects/<project_id>/extensions", methods=["GET", "POST"])
def project_placeholder(project_id=None):
    # TODO: Define authenticated request/response schemas and connect services.
    return jsonify({"error": "Project API is not implemented"}), 501
