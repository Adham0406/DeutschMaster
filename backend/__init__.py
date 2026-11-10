"""DeutschMaster Flask application factory."""
import logging

from flask import Flask, abort, request, send_from_directory
from werkzeug.exceptions import HTTPException

from .config import Config
from .routes.api import api
from .services.translation_service import TranslationService
from .services.word_service import WordRepository
from .utils.validation import ApiError, error_response


def create_app(config: type[Config] = Config) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config)
    app.json.ensure_ascii = False
    app.json.sort_keys = False
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    repo = WordRepository(app.config["WORDS_FILE"])
    app.extensions["word_repo"] = repo
    app.extensions["translator"] = TranslationService(
        repo, app.config["LINGVA_INSTANCES"], app.config["LINGVA_TIMEOUT"])

    app.register_blueprint(api)
    frontend = app.config["FRONTEND_DIR"]

    @app.get("/")
    def index():
        return send_from_directory(frontend, "index.html")

    @app.get("/<path:path>")
    def static_files(path):
        if path.startswith("api/"):
            # The catch-all would otherwise swallow e.g. GET /api/translate (POST-only).
            others = app.url_map.bind("localhost").allowed_methods("/" + path)
            if set(others) - {"GET", "HEAD", "OPTIONS"}:
                abort(405)
            abort(404)
        # send_from_directory rejects path traversal outside FRONTEND_DIR.
        return send_from_directory(frontend, path)

    @app.after_request
    def headers(resp):
        origin = request.headers.get("Origin", "").rstrip("/")
        if origin and origin in app.config["CORS_ORIGINS"] and request.path.startswith("/api/"):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "same-origin"
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
            "media-src 'self' blob: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        return resp

    @app.errorhandler(ApiError)
    def api_error(err: ApiError):
        return error_response(err.message, err.status)

    @app.errorhandler(HTTPException)
    def http_error(err: HTTPException):
        if request.path.startswith("/api/"):
            messages = {404: "Endpoint topilmadi", 405: "Bu HTTP metodga ruxsat yo‘q",
                        413: "So‘rov hajmi juda katta"}
            return error_response(messages.get(err.code, err.description), err.code)
        return err

    @app.errorhandler(Exception)
    def unhandled(err: Exception):
        app.logger.exception("Unhandled error")
        return error_response("Serverda kutilmagan xatolik yuz berdi", 500)

    return app
