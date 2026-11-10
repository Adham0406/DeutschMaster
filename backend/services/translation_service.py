"""Translation through Lingva (a Google Translate front-end) with local fallback.

Lingva has no API key, so nothing secret ever reaches the frontend. Public instances
are rate limited and often unavailable, therefore every failure path falls back to the
local dictionary and returns a clear, user-facing message instead of an error page.
"""
import logging
from urllib.parse import quote

import requests

from .word_service import WordRepository

log = logging.getLogger(__name__)
USER_AGENT = "DeutschMaster/1.0 (educational app)"


class TranslationService:
    def __init__(self, repo: WordRepository, instances: list[str], timeout: float = 6.0,
                 session: requests.Session | None = None):
        self.repo = repo
        self.instances = instances
        self.timeout = timeout
        self.session = session or requests.Session()
        self.last_status: dict = {"available": None, "detail": "Hali tekshirilmagan"}

    def _lingva(self, text: str, source: str, target: str) -> tuple[str | None, str]:
        if not self.instances:
            return None, "Lingva instance sozlanmagan"
        errors = []
        for base in self.instances:
            url = f"{base}/api/v1/{source}/{target}/{quote(text, safe='')}"
            try:
                resp = self.session.get(url, timeout=self.timeout,
                                        headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            except requests.RequestException as exc:
                errors.append(f"{base}: {exc.__class__.__name__}")
                continue
            if resp.status_code == 429:
                errors.append(f"{base}: so‘rovlar limiti oshib ketdi (429)")
                continue
            if resp.status_code != 200:
                errors.append(f"{base}: HTTP {resp.status_code}")
                continue
            try:
                translation = resp.json().get("translation")
            except ValueError:
                errors.append(f"{base}: JSON emas")
                continue
            if translation:
                return translation, base
            errors.append(f"{base}: bo‘sh javob")
        return None, "; ".join(errors)

    def translate(self, text: str, source: str, target: str) -> dict:
        translation, detail = self._lingva(text, source, target)
        if translation:
            self.last_status = {"available": True, "detail": detail}
            return {"source": "lingva", "translation": translation, "text": text,
                    "from": source, "to": target, "message": None, "word": None}

        self.last_status = {"available": False, "detail": detail}
        log.info("Lingva unavailable, using local dictionary: %s", detail)
        word = self.repo.find_exact(text, source)
        if word:
            translation = word["uzbek"] if source == "de" else (
                f'{word["article"]} {word["german"]}'.strip())
            return {"source": "local", "translation": translation, "text": text,
                    "from": source, "to": target, "word": word,
                    "message": "Onlayn tarjima xizmati hozir mavjud emas — natija lokal lug‘atdan olindi."}

        suggestions = self.repo.search(text, lang=source)[:5]
        return {"source": "none", "translation": None, "text": text, "from": source, "to": target,
                "word": None, "suggestions": suggestions,
                "message": "Onlayn tarjima xizmati hozir mavjud emas va bu so‘z lokal lug‘atda topilmadi."}
