"""Online translation with a provider chain and local fallback.

Order: Lingva instances (Google Translate front-end) -> MyMemory -> local dictionary.
Neither provider needs an API key, so nothing secret reaches the frontend. Public
services are rate limited and can be down; every failure falls through to the next
provider and finally to the local dictionary with a clear, user-facing message.
"""
import html
import logging
from urllib.parse import quote

import requests

from .word_service import WordRepository

log = logging.getLogger(__name__)
USER_AGENT = "DeutschMaster/1.0 (educational app)"
MYMEMORY_URL = "https://api.mymemory.translated.net/get"


class TranslationService:
    def __init__(self, repo: WordRepository, instances: list[str], timeout: float = 6.0,
                 session: requests.Session | None = None, mymemory: bool = True):
        self.repo = repo
        self.instances = instances
        self.timeout = timeout
        self.mymemory = mymemory
        self.session = session or requests.Session()
        self.last_status: dict = {"available": None, "detail": "Hali tekshirilmagan"}

    def _get(self, url, **kwargs):
        return self.session.get(url, timeout=self.timeout,
                                headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, **kwargs)

    def _lingva(self, text: str, source: str, target: str, errors: list[str]) -> str | None:
        for base in self.instances:
            try:
                resp = self._get(f"{base}/api/v1/{source}/{target}/{quote(text, safe='')}")
            except requests.RequestException as exc:
                errors.append(f"{base}: {exc.__class__.__name__}")
                continue
            if resp.status_code != 200:
                errors.append(f"{base}: HTTP {resp.status_code}" + (" (limit)" if resp.status_code == 429 else ""))
                continue
            try:
                translation = resp.json().get("translation")
            except ValueError:
                errors.append(f"{base}: JSON emas")
                continue
            if translation:
                return translation
            errors.append(f"{base}: bo‘sh javob")
        return None

    def _mymemory(self, text: str, source: str, target: str, errors: list[str]) -> str | None:
        if not self.mymemory:
            return None
        try:
            resp = self._get(MYMEMORY_URL, params={"q": text, "langpair": f"{source}|{target}"})
        except requests.RequestException as exc:
            errors.append(f"MyMemory: {exc.__class__.__name__}")
            return None
        if resp.status_code != 200:
            errors.append(f"MyMemory: HTTP {resp.status_code}")
            return None
        try:
            data = resp.json()
        except ValueError:
            errors.append("MyMemory: JSON emas")
            return None
        translated = (data.get("responseData") or {}).get("translatedText") or ""
        if data.get("quotaFinished") or "MYMEMORY WARNING" in translated.upper():
            errors.append("MyMemory: kunlik limit tugadi")
            return None
        if str(data.get("responseStatus")) != "200" or not translated.strip():
            errors.append(f"MyMemory: {data.get('responseDetails') or 'bo‘sh javob'}")
            return None
        return html.unescape(translated).strip()  # MyMemory HTML-escapes its output

    def translate(self, text: str, source: str, target: str) -> dict:
        errors: list[str] = []
        word = self.repo.find_exact(text, source)
        for name, provider in (("lingva", self._lingva), ("mymemory", self._mymemory)):
            translation = provider(text, source, target, errors)
            if translation:
                self.last_status = {"available": True, "detail": name, "errors": errors}
                return {"source": name, "translation": translation, "text": text,
                        "from": source, "to": target, "message": None, "word": word}

        detail = "; ".join(errors) or "Onlayn provayder sozlanmagan"
        self.last_status = {"available": False, "detail": detail}
        log.info("Online translation unavailable, using local dictionary: %s", detail)
        if word:
            translation = word["uzbek"] if source == "de" else f'{word["article"]} {word["german"]}'.strip()
            return {"source": "local", "translation": translation, "text": text,
                    "from": source, "to": target, "word": word,
                    "message": "Onlayn tarjima xizmati hozir mavjud emas — natija lokal lug‘atdan olindi."}

        suggestions = self.repo.search(text, lang=source)[:5]
        return {"source": "none", "translation": None, "text": text, "from": source, "to": target,
                "word": None, "suggestions": suggestions,
                "message": "Onlayn tarjima xizmati hozir mavjud emas va bu so‘z lokal lug‘atda topilmadi."}
