"""Merge vocabulary batches into data/words.json and validate them.

Batch files: tools/words/<LEVEL>_*.txt, one word per line, '|' separated:

    german | article | pos | ipa | uzbek | example_de | example_uz | topic

- pos: N Nomen, V Verb, A Adjektiv, D Adverb, P Präposition, K Konjunktion, R Pronomen, X Ausdruck
- ipa without brackets (added automatically)
- topic may be empty: N -> Nomen, V -> Verben, A -> Adjektive, others -> Alltag
- lines starting with # and blank lines are ignored

Words already in data/words.json keep their ids; new ones are appended.
Run:  python tools/build_words.py          (validate + write)
      python tools/build_words.py --check  (validate only)
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS = ROOT / "data" / "words.json"
BATCH_DIR = ROOT / "tools" / "words"
POS = {"N": "Nomen", "V": "Verb", "A": "Adjektiv", "D": "Adverb", "P": "Präposition",
       "K": "Konjunktion", "R": "Pronomen", "X": "Ausdruck"}
DEFAULT_TOPIC = {"N": "Nomen", "V": "Verben", "A": "Adjektive"}
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


def key(german: str) -> str:
    # Case-sensitive on purpose: German capitalisation separates words (Morgen / morgen).
    return german.strip()


def main(check_only: bool) -> int:
    data = json.loads(WORDS.read_text(encoding="utf-8"))
    topics = data["topics"]
    words = data["words"]
    by_key = {key(w["german"]): w for w in words}
    next_id = max(w["id"] for w in words) + 1
    errors, added, updated = [], [], 0
    seen_in_batches: set[str] = set()

    for path in sorted(BATCH_DIR.glob("*.txt")):
        level = path.stem.split("_")[0]
        if level not in LEVELS:
            errors.append(f"{path.name}: noma'lum daraja {level}")
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            where = f"{path.name}:{n}"
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 8:
                errors.append(f"{where}: {len(parts)} ta ustun (8 kerak): {line[:60]}")
                continue
            german, article, pos, ipa, uz, ex_de, ex_uz, topic = parts
            if pos not in POS:
                errors.append(f"{where}: noto'g'ri pos {pos}")
                continue
            topic = topic or DEFAULT_TOPIC.get(pos, "Alltag")
            problems = []
            if topic not in topics:
                problems.append(f"mavzu {topic}")
            if pos == "N" and article not in ("der", "die", "das"):
                problems.append("ot artiklsiz")
            if pos != "N" and article:
                problems.append("faqat otlarda artikl bo'ladi")
            if pos == "V" and not german.split()[-1].endswith("n"):
                problems.append("fe'l infinitivda emas")
            if any("Ѐ" <= ch <= "ӿ" for ch in uz + ex_uz):
                problems.append("o'zbekcha matnda kirill harfi")
            if any(ch in line for ch in "­​‌‍﻿"):
                problems.append("ko'rinmas belgi (soft hyphen / zero-width)")
            if not all([german, ipa, uz, ex_de, ex_uz]):
                problems.append("bo'sh maydon")
            if ex_de[-1:] not in ".!?" or ex_uz[-1:] not in ".!?" or not ex_de[:1].isupper():
                problems.append("misol gap ko'rinishida emas")
            existing = by_key.get(key(german))
            # Re-running is idempotent: a batch word already in words.json (same level) is updated
            # in place and keeps its id. Anything else with the same spelling is a real duplicate.
            if key(german) in seen_in_batches or (existing and existing["level"] != level):
                problems.append(f"takror (id={existing['id']}, {existing['level']})" if existing else "takror")
            if problems:
                errors.append(f"{where} {german}: " + ", ".join(problems))
                continue
            seen_in_batches.add(key(german))
            fields = {"german": german, "uzbek": uz, "article": article, "part_of_speech": POS[pos],
                      "pronunciation": f"[{ipa}]", "example_de": ex_de, "example_uz": ex_uz,
                      "level": level, "topic": topic}
            if existing:
                existing.update(fields)
                updated += 1
                continue
            w = {"id": next_id, **fields, "audio_url": ""}
            next_id += 1
            by_key[key(german)] = w
            added.append(w)

    all_words = words + added
    uz_count = defaultdict(list)
    for w in all_words:
        uz_count[w["uzbek"].casefold()].append(f'{w["german"]}({w["level"]})')
    for uz, owners in uz_count.items():
        if len(owners) > 1:
            errors.append(f"bir xil tarjima '{uz}': {', '.join(owners)}")

    levels = Counter(w["level"] for w in all_words)
    print(f"mavjud: {len(words)} (partiyadan yangilangan: {updated}), yangi: {len(added)}, jami: {len(all_words)}")
    print("darajalar:", {lvl: levels[lvl] for lvl in LEVELS})
    if errors:
        print(f"\n{len(errors)} ta muammo:")
        for e in errors:
            print("  -", e)
        return 1
    if not check_only:
        data["words"] = all_words
        WORDS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"yozildi: {WORDS}")
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
