// Thin client for the Flask API. All network access lives here.

const TIMEOUT_MS = 10000;

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(path, { ...options, signal: ctrl.signal, headers: { Accept: "application/json", ...(options.headers || {}) } });
  } catch (err) {
    throw new ApiError(err.name === "AbortError" ? "Server javob bermadi (timeout)" : "Serverga ulanib bo‘lmadi. Flask server ishlayaptimi?", 0);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await resp.json(); } catch { /* non-JSON */ }
  if (!resp.ok || !data || data.ok === false) {
    throw new ApiError((data && data.error) || `Server xatosi (${resp.status})`, resp.status);
  }
  return data;
}

let wordsCache = null;

export const api = {
  health: () => request("/api/health"),
  async words() {
    if (!wordsCache) wordsCache = request("/api/words").then((d) => d.words).catch((e) => { wordsCache = null; throw e; });
    return wordsCache;
  },
  word: (id) => request(`/api/words/${encodeURIComponent(id)}`).then((d) => d.word),
  levels: () => request("/api/levels").then((d) => d.levels),
  topics: () => request("/api/topics").then((d) => d.topics),
  search(q, { lang = "all", level = "", topic = "" } = {}) {
    const p = new URLSearchParams({ q, lang });
    if (level) p.set("level", level);
    if (topic) p.set("topic", topic);
    return request(`/api/search?${p}`);
  },
  translate: (text, from = "de", to = "uz") => request("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, from, to }),
  }),
  statistics: () => request("/api/statistics"),
};
