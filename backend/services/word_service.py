"""Vocabulary repository.

The rest of the backend only talks to ``WordRepository``. It currently reads a JSON
file; a SQLite implementation can later provide the same methods without touching
routes or tests.
"""
import json
import unicodedata
from collections import Counter
from pathlib import Path

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
LEVEL_NAMES = {
    "A1": "Beginner",
    "A2": "Elementary",
    "B1": "Intermediate",
    "B2": "Upper Intermediate",
    "C1": "Advanced",
    "C2": "Proficiency",
}
TOPICS = {
    "Familie": "Oila",
    "Essen": "Ovqat",
    "Trinken": "Ichimliklar",
    "Reisen": "Sayohat",
    "Arbeit": "Ish",
    "Schule": "Maktab",
    "Universität": "Universitet",
    "Alltag": "Kundalik hayot",
    "Gesundheit": "Sog‘liq",
    "Natur": "Tabiat",
    "Technologie": "Texnologiya",
    "Verben": "Fe’llar",
    "Adjektive": "Sifatlar",
    "Nomen": "Otlar",
}
REQUIRED_FIELDS = [
    "id", "german", "uzbek", "article", "part_of_speech", "pronunciation",
    "example_de", "example_uz", "level", "topic", "audio_url",
]


def normalize(text: str) -> str:
    """Lowercase, unify apostrophe variants used in Uzbek Latin, fold ß/umlauts for matching."""
    text = unicodedata.normalize("NFC", text or "").casefold().strip()
    for ch in "‘’ʻʼ`´'":
        text = text.replace(ch, "'")
    return text


def fold(text: str) -> str:
    """Looser form: also maps ä→a, ö→o, ü→u, ß→ss so 'mude' finds 'müde'."""
    text = normalize(text)
    return (text.replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("ß", "ss"))


class WordRepository:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._words: list[dict] = []
        self._by_id: dict[int, dict] = {}
        self.load()

    def load(self) -> None:
        with open(self.path, encoding="utf-8") as fh:
            data = json.load(fh)
        words = data["words"] if isinstance(data, dict) else data
        self._words = words
        self._by_id = {w["id"]: w for w in words}

    def all(self) -> list[dict]:
        return list(self._words)

    def get(self, word_id: int) -> dict | None:
        return self._by_id.get(word_id)

    def filter(self, level: str | None = None, topic: str | None = None) -> list[dict]:
        result = self._words
        if level:
            result = [w for w in result if w["level"] == level]
        if topic:
            result = [w for w in result if w["topic"] == topic]
        return list(result)

    def search(self, query: str, lang: str = "all", level: str | None = None,
               topic: str | None = None) -> list[dict]:
        q = fold(query)
        if not q:
            return []
        scored = []
        for w in self.filter(level, topic):
            fields = []
            if lang in ("all", "de"):
                fields.append(fold(w["german"]))
                fields.append(fold(f'{w["article"]} {w["german"]}'.strip()))
            if lang in ("all", "uz"):
                fields.extend(fold(part) for part in w["uzbek"].split(";"))
                fields.append(fold(w["uzbek"]))
            score = 0
            for f in fields:
                if f == q:
                    score = max(score, 3)
                elif f.startswith(q):
                    score = max(score, 2)
                elif q in f:
                    score = max(score, 1)
            if score:
                scored.append((score, w))
        scored.sort(key=lambda item: (-item[0], item[1]["id"]))
        return [w for _, w in scored]

    def find_exact(self, text: str, source: str) -> dict | None:
        """Exact lookup used as translation fallback."""
        q = fold(text)
        for w in self._words:
            if source == "de":
                if q in (fold(w["german"]), fold(f'{w["article"]} {w["german"]}'.strip())):
                    return w
            else:
                if q == fold(w["uzbek"]) or q in (fold(p) for p in w["uzbek"].split(";")):
                    return w
        return None

    def statistics(self) -> dict:
        return {
            "total_words": len(self._words),
            "by_level": {lvl: sum(1 for w in self._words if w["level"] == lvl) for lvl in LEVELS},
            "by_topic": dict(Counter(w["topic"] for w in self._words)),
            "by_part_of_speech": dict(Counter(w["part_of_speech"] for w in self._words)),
        }
