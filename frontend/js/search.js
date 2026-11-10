// Client-side search with the same rules as backend/services/word_service.py
// (case-, umlaut- and apostrophe-insensitive; exact > prefix > substring).

export function fold(text) {
  return String(text ?? "").normalize("NFC").toLowerCase().trim()
    .replace(/[‘’ʻʼ`´']/g, "'")
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
}

function fields(w, lang) {
  const out = [];
  if (lang !== "uz") out.push(fold(w.german), fold(`${w.article} ${w.german}`));
  if (lang !== "de") out.push(fold(w.uzbek), ...w.uzbek.split(";").map(fold));
  return out;
}

export function searchWords(words, query, { lang = "all", level = "", topic = "" } = {}) {
  const q = fold(query);
  if (!q) return [];
  const scored = [];
  for (const w of words) {
    if ((level && w.level !== level) || (topic && w.topic !== topic)) continue;
    let score = 0;
    for (const f of fields(w, lang)) {
      if (f === q) score = Math.max(score, 3);
      else if (f.startsWith(q)) score = Math.max(score, 2);
      else if (f.includes(q)) score = Math.max(score, 1);
    }
    if (score) scored.push([score, w]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].id - b[1].id).map(([, w]) => w);
}

export function findExact(words, text, source) {
  const q = fold(text);
  return words.find((w) => (source === "de"
    ? [fold(w.german), fold(`${w.article} ${w.german}`)].includes(q)
    : fields(w, "uz").includes(q))) || null;
}
