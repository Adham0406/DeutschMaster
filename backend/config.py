"""Application configuration loaded from environment variables (.env supported)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _split(value: str) -> list[str]:
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


class Config:
    BASE_DIR = BASE_DIR
    FRONTEND_DIR = BASE_DIR / "frontend"
    WORDS_FILE = Path(os.getenv("WORDS_FILE", BASE_DIR / "data" / "words.json"))

    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "5000"))
    DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"

    # Comma separated list of Lingva instances, tried in order.
    LINGVA_INSTANCES = _split(os.getenv("LINGVA_INSTANCES", "https://lingva.ml"))
    LINGVA_TIMEOUT = float(os.getenv("LINGVA_TIMEOUT", "6"))
    # MyMemory (api.mymemory.translated.net) is the second provider; no key required.
    MYMEMORY_ENABLED = os.getenv("MYMEMORY_ENABLED", "1") == "1"
    TRANSLATE_MAX_CHARS = int(os.getenv("TRANSLATE_MAX_CHARS", "300"))
    # Simple in-memory per-IP rate limit for /api/translate.
    TRANSLATE_RATE_LIMIT = int(os.getenv("TRANSLATE_RATE_LIMIT", "30"))  # requests per minute

    # Origins allowed to call the API cross-origin. The bundled frontend is same-origin
    # and needs no entry here.
    CORS_ORIGINS = _split(os.getenv("CORS_ORIGINS", ""))

    JSON_SORT_KEYS = False
    MAX_CONTENT_LENGTH = 16 * 1024  # request bodies are tiny; reject anything larger


class TestConfig(Config):
    TESTING = True
    # never hit the network in tests unless a test opts in
    LINGVA_INSTANCES: list[str] = []
    MYMEMORY_ENABLED = False
