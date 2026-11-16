import os

from flask import Flask

from .routes import api

DATA_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def _env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes")


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        REPORTS_DIR=os.environ.get("PROOFWORK_REPORTS_DIR", os.path.join(DATA_ROOT, "reports")),
        BRIEFS_DIR=os.environ.get("PROOFWORK_BRIEFS_DIR", os.path.join(DATA_ROOT, "briefs")),
        # DEVELOPMENT ONLY: lets the inspector reach localhost and private addresses.
        INSPECTOR_ALLOW_PRIVATE_HOSTS=_env_flag("INSPECTOR_ALLOW_PRIVATE_HOSTS"),
        INSPECTOR_RUN_LIGHTHOUSE=not _env_flag("INSPECTOR_SKIP_LIGHTHOUSE"),
    )
    if config:
        app.config.update(config)
    app.register_blueprint(api, url_prefix="/api")
    return app
