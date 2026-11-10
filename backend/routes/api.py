"""REST API: /api/*"""
import time
from collections import defaultdict, deque

from flask import Blueprint, current_app, jsonify, request

from ..services.word_service import LEVEL_NAMES, LEVELS, TOPICS
from ..utils.validation import ApiError, choice, clean_text, positive_int

api = Blueprint("api", __name__, url_prefix="/api")
_rate_buckets: dict[str, deque] = defaultdict(deque)


def repo():
    return current_app.extensions["word_repo"]


def translator():
    return current_app.extensions["translator"]


@api.get("/health")
def health():
    return jsonify({"ok": True, "status": "healthy", "words": len(repo().all()),
                    "translation": translator().last_status})


@api.get("/words")
def words():
    level = choice(request.args.get("level"), "level", LEVELS)
    topic = choice(request.args.get("topic"), "topic", list(TOPICS))
    limit = positive_int(request.args.get("limit"), "limit", default=0, maximum=1000)
    offset = positive_int(request.args.get("offset"), "offset", default=0, maximum=100000)
    items = repo().filter(level, topic)
    total = len(items)
    items = items[offset:offset + limit] if limit else items[offset:]
    return jsonify({"ok": True, "total": total, "count": len(items), "words": items})


@api.get("/words/<word_id>")
def word_detail(word_id):
    if not word_id.isdigit():
        raise ApiError("So‘z ID raqam bo‘lishi kerak", 400)
    word = repo().get(int(word_id))
    if not word:
        raise ApiError("So‘z topilmadi", 404)
    return jsonify({"ok": True, "word": word})


@api.get("/levels")
def levels():
    stats = repo().statistics()["by_level"]
    return jsonify({"ok": True, "levels": [
        {"code": lvl, "name": LEVEL_NAMES[lvl], "count": stats[lvl]} for lvl in LEVELS]})


@api.get("/topics")
def topics():
    stats = repo().statistics()["by_topic"]
    return jsonify({"ok": True, "topics": [
        {"code": de, "name_de": de, "name_uz": uz, "count": stats.get(de, 0)} for de, uz in TOPICS.items()]})


@api.get("/search")
def search():
    q = clean_text(request.args.get("q"), "q", max_len=100)
    lang = choice(request.args.get("lang"), "lang", ["all", "de", "uz"], default="all")
    level = choice(request.args.get("level"), "level", LEVELS)
    topic = choice(request.args.get("topic"), "topic", list(TOPICS))
    results = repo().search(q, lang, level, topic)
    return jsonify({"ok": True, "query": q, "count": len(results), "words": results})


def _check_rate_limit():
    limit = current_app.config["TRANSLATE_RATE_LIMIT"]
    key = request.remote_addr or "unknown"
    now = time.monotonic()
    bucket = _rate_buckets[key]
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= limit:
        raise ApiError("Juda ko‘p tarjima so‘rovi. Bir daqiqadan so‘ng qayta urinib ko‘ring.", 429)
    bucket.append(now)


@api.post("/translate")
def translate():
    if not request.is_json:
        raise ApiError("So‘rov JSON formatida bo‘lishi kerak (Content-Type: application/json)", 415)
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError("JSON obyekt kutilgan edi", 400)
    text = clean_text(body.get("text"), "text", current_app.config["TRANSLATE_MAX_CHARS"])
    source = choice(body.get("from"), "from", ["de", "uz"], default="de")
    target = choice(body.get("to"), "to", ["de", "uz"], default="uz" if source == "de" else "de")
    if source == target:
        raise ApiError("'from' va 'to' tillari har xil bo‘lishi kerak", 400)
    _check_rate_limit()
    return jsonify({"ok": True, **translator().translate(text, source, target)})


@api.get("/statistics")
def statistics():
    return jsonify({"ok": True, **repo().statistics()})
