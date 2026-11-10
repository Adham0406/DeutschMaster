// Data access for the app. Two modes, chosen automatically at startup:
//  - "server": the Flask backend answers /api/* (python app.py)
//  - "static": no backend (e.g. GitHub Pages). Words come from data/words.json,
//    search runs in the browser and translation calls MyMemory directly.
// All URLs are relative so the app also works under a sub-path such as /DeutschMaster/.
import { findExact, searchWords } from "./search.js";

const TIMEOUT_MS = 10000;
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function fetchJson(url, options = {}, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let resp;
  try {
    resp = await fetch(url, { ...options, signal: ctrl.signal, headers: { Accept: "application/json", ...(options.headers || {}) } });
  } catch (err) {
    throw new ApiError(err.name === "AbortError" ? "Javob kelmadi (timeout)" : "Tarmoqqa ulanib bo‘lmadi", 0);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await resp.json(); } catch { /* non-JSON, e.g. a 404 page */ }
  if (!resp.ok || !data || data.ok === false) {
    throw new ApiError((data && data.error) || `Xato (${resp.status})`, resp.status);
  }
  return data;
}

// ---------- mode detection & static dataset ----------
let modePromise = null;
let dataset = null; // { levels, topics, words }

async function detectMode() {
  // GitHub Pages never has a backend; skip the probe (and its 404 in the console).
  if (location.hostname.endsWith(".github.io")) return "static";
  try {
    const health = await fetchJson("api/health", {}, 4000);
    if (health.status === "healthy") return "server";
  } catch { /* no backend */ }
  return "static";
}

export function mode() {
  if (!modePromise) modePromise = detectMode();
  return modePromise;
}

async function loadDataset() {
  if (!dataset) {
    try {
      // GitHub Pages serves files with max-age=600; "no-cache" makes the browser revalidate
      // (a cheap 304 when unchanged) so a new vocabulary shows up right after a deploy.
      dataset = await fetchJson("data/words.json", { cache: "no-cache" });
    } catch (err) {
      throw new ApiError(`So‘zlar faylini (data/words.json) yuklab bo‘lmadi: ${err.message}`, err.status);
    }
  }
  return dataset;
}

// ---------- translation ----------
// MyMemory returns HTML-escaped text (e.g. o&#39;rganyapman); the UI escapes again on render.
function decodeEntities(text) {
  return new DOMParser().parseFromString(`<!doctype html><body>${text}`, "text/html").body.textContent || "";
}

async function translateMyMemory(text, from, to) {
  const url = `${MYMEMORY_URL}?${new URLSearchParams({ q: text, langpair: `${from}|${to}` })}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return { error: `MyMemory: HTTP ${resp.status}` };
    const data = await resp.json();
    const out = (data.responseData && data.responseData.translatedText) || "";
    if (data.quotaFinished || /MYMEMORY WARNING/i.test(out)) return { error: "MyMemory: kunlik limit tugadi" };
    if (String(data.responseStatus) !== "200" || !out.trim()) return { error: `MyMemory: ${data.responseDetails || "bo‘sh javob"}` };
    return { translation: decodeEntities(out).trim() };
  } catch (err) {
    return { error: `MyMemory: ${err.name === "AbortError" ? "timeout" : "tarmoq xatosi"}` };
  } finally {
    clearTimeout(timer);
  }
}

async function translateStatic(text, from, to) {
  const { words } = await loadDataset();
  const word = findExact(words, text, from);
  const online = await translateMyMemory(text, from, to);
  if (online.translation) {
    return { ok: true, source: "mymemory", translation: online.translation, text, from, to, word, message: null };
  }
  if (word) {
    return { ok: true, source: "local", text, from, to, word,
      translation: from === "de" ? word.uzbek : `${word.article} ${word.german}`.trim(),
      message: "Onlayn tarjima xizmati hozir mavjud emas — natija lokal lug‘atdan olindi." };
  }
  return { ok: true, source: "none", translation: null, text, from, to, word: null,
    suggestions: searchWords(words, text, { lang: from }).slice(0, 5),
    message: "Onlayn tarjima xizmati hozir mavjud emas va bu so‘z lokal lug‘atda topilmadi." };
}

// ---------- public API (same shape in both modes) ----------
const cache = {};
const once = (key, fn) => (cache[key] ||= fn().catch((e) => { delete cache[key]; throw e; }));

export const api = {
  mode,
  async health() {
    if ((await mode()) === "server") return fetchJson("api/health");
    const { words } = await loadDataset();
    return { ok: true, status: "static", words: words.length };
  },
  words: () => once("words", async () => ((await mode()) === "server"
    ? (await fetchJson("api/words")).words
    : (await loadDataset()).words)),
  topics: () => once("topics", async () => {
    if ((await mode()) === "server") return (await fetchJson("api/topics")).topics;
    const { topics, words } = await loadDataset();
    return Object.entries(topics).map(([de, uz]) => ({
      code: de, name_de: de, name_uz: uz, count: words.filter((w) => w.topic === de).length }));
  }),
  async search(q, { lang = "all", level = "", topic = "" } = {}) {
    if ((await mode()) === "server") {
      const p = new URLSearchParams({ q, lang });
      if (level) p.set("level", level);
      if (topic) p.set("topic", topic);
      return fetchJson(`api/search?${p}`);
    }
    const words = searchWords((await loadDataset()).words, q, { lang, level, topic });
    return { ok: true, query: q, count: words.length, words };
  },
  async translate(text, from = "de", to = "uz") {
    if ((await mode()) === "server") {
      return fetchJson("api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from, to }),
      });
    }
    return translateStatic(text, from, to);
  },
};
