"""Data quality tests for data/words.json."""
import json
from collections import Counter
from pathlib import Path

import pytest

from backend.services.word_service import LEVELS, REQUIRED_FIELDS

WORDS_FILE = Path(__file__).resolve().parent.parent / "data" / "words.json"
DATA = json.loads(WORDS_FILE.read_text(encoding="utf-8"))  # also proves JSON syntax is valid
TOPICS = DATA["topics"]


@pytest.fixture(scope="module")
def words():
    return DATA["words"]


def test_metadata():
    assert list(DATA["levels"]) == LEVELS
    assert len(TOPICS) == 14 and all(v.strip() for v in TOPICS.values())


def test_minimum_total(words):
    assert len(words) >= 2000


def test_each_level_has_at_least_200_words(words):
    counts = Counter(w["level"] for w in words)
    assert all(counts[lvl] >= 200 for lvl in LEVELS), counts


def test_no_cyrillic_or_invisible_characters(words):
    """Uzbek is written in Latin script here; mixed Cyrillic letters are typos."""
    for w in words:
        for f in ("uzbek", "example_uz"):
            assert not any("Ѐ" <= ch <= "ӿ" for ch in w[f]), (w["german"], w[f])
        for f in REQUIRED_FIELDS:
            assert not any(ch in str(w[f]) for ch in "­​‌‍﻿"), (w["german"], f)


def test_uzbek_translations_unique(words):
    dupes = [t for t, n in Counter(w["uzbek"].casefold() for w in words).items() if n > 1]
    assert not dupes, dupes


@pytest.mark.parametrize("level", LEVELS)
def test_each_level_has_at_least_20_words(words, level):
    count = sum(1 for w in words if w["level"] == level)
    assert count >= 20, f"{level} darajada faqat {count} ta so‘z bor"


def test_only_known_levels_and_topics(words):
    assert {w["level"] for w in words} == set(LEVELS)
    assert {w["topic"] for w in words} <= set(TOPICS)


def test_all_topics_used(words):
    assert {w["topic"] for w in words} == set(TOPICS)


def test_required_fields_present(words):
    for w in words:
        missing = [f for f in REQUIRED_FIELDS if f not in w]
        assert not missing, f"id={w.get('id')}: yetishmayotgan maydonlar {missing}"
        for f in REQUIRED_FIELDS:
            if f in ("article", "audio_url"):
                continue  # article is empty for verbs/adjectives; audio comes from Web Speech
            assert str(w[f]).strip(), f"id={w['id']}: '{f}' bo‘sh"


def test_unique_ids_and_words(words):
    ids = [w["id"] for w in words]
    assert len(ids) == len(set(ids))
    # case-sensitive: in German "Morgen" (morning) and "morgen" (tomorrow) are different words
    dupes = [g for g, n in Counter(w["german"] for w in words).items() if n > 1]
    assert not dupes, f"Takroriy so‘zlar: {dupes}"


def test_nouns_have_articles(words):
    for w in words:
        if w["part_of_speech"] == "Nomen":
            assert w["article"] in ("der", "die", "das"), w["german"]
        else:
            assert w["article"] == "", w["german"]


def test_verbs_are_infinitives(words):
    for w in words:
        if w["part_of_speech"] == "Verb":
            assert w["german"].split()[-1].endswith("n"), w["german"]


def test_examples_are_sentences(words):
    for w in words:
        assert w["example_de"][-1] in ".!?", w["example_de"]
        assert w["example_uz"][-1] in ".!?", w["example_uz"]
        assert w["example_de"][0].isupper(), w["example_de"]


def test_pronunciation_format(words):
    for w in words:
        assert w["pronunciation"].startswith("[") and w["pronunciation"].endswith("]")
