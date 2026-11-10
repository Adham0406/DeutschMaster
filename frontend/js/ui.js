// Shared UI helpers: DOM, icons, toasts, modals, speech, word rendering, practice pools.
import { getState } from "./storage.js";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const LEVEL_NAMES = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper Intermediate", C1: "Advanced", C2: "Proficiency" };

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function icons(root = document) {
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons({ attrs: { "stroke-width": 2 }, nameAttr: "data-lucide", root });
  }
}

export const icon = (name) => `<i data-lucide="${name}"></i>`;

// ---------- toasts ----------
const TOAST_ICONS = { success: "check-circle-2", error: "alert-circle", info: "info", xp: "sparkles" };
export function toast(title, message = "", type = "info", ms = 3200) {
  const root = document.getElementById("toasts");
  if (!root) return;
  const node = el(`<div class="toast ${type}" role="status">${icon(TOAST_ICONS[type] || "info")}
    <div><div class="toast-title">${esc(title)}</div>${message ? `<div class="toast-msg">${esc(message)}</div>` : ""}</div></div>`);
  root.appendChild(node);
  icons(node);
  while (root.children.length > 4) root.firstElementChild.remove();
  setTimeout(() => { node.classList.add("out"); setTimeout(() => node.remove(), 220); }, ms);
}

// ---------- modal ----------
export function modal({ title, body = "", actions = [{ label: "Yopish", value: null }] }) {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    const prevFocus = document.activeElement;
    const node = el(`<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal"><h3 id="modal-title">${esc(title)}</h3><div class="modal-body">${body}</div>
      <div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.cls || ""}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div></div></div>`);
    const close = (value) => {
      node.remove();
      document.removeEventListener("keydown", onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    node.addEventListener("click", (e) => {
      if (e.target === node) return close(null);
      const btn = e.target.closest("button[data-i]");
      if (btn) close(actions[Number(btn.dataset.i)].value);
    });
    document.addEventListener("keydown", onKey);
    root.appendChild(node);
    icons(node);
    const primary = node.querySelector(".modal-actions .btn:last-child");
    if (primary) primary.focus();
  });
}

export const confirmModal = (title, body, okLabel = "Tasdiqlash", danger = false) => modal({
  title, body,
  actions: [{ label: "Bekor qilish", value: false }, { label: okLabel, value: true, cls: danger ? "btn-danger solid" : "btn-primary" }],
});

// ---------- speech ----------
let germanVoice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  germanVoice = voices.find((v) => v.lang === "de-DE") || voices.find((v) => v.lang && v.lang.startsWith("de")) || null;
  return germanVoice;
}
if ("speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

export function speechSupported() {
  return "speechSynthesis" in window;
}

export function speak(textOrWord) {
  const { volume, rate } = getState().settings;
  const word = typeof textOrWord === "object" ? textOrWord : null;
  if (word && word.audio_url) {
    const audio = new Audio(word.audio_url);
    audio.volume = volume;
    audio.play().catch(() => speak(spoken(word)));
    return true;
  }
  const text = word ? spoken(word) : String(textOrWord);
  if (!speechSupported()) {
    toast("Audio mavjud emas", "Brauzeringiz Web Speech API ni qo‘llab-quvvatlamaydi.", "error");
    return false;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "de-DE";
  u.volume = volume;
  u.rate = rate;
  if (germanVoice || pickVoice()) u.voice = germanVoice;
  window.speechSynthesis.speak(u);
  return true;
}

export const spoken = (w) => (w.article ? `${w.article} ${w.german}` : w.german);

// ---------- formatting ----------
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function formatDuration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} daq`;
  return `${Math.floor(m / 60)} soat ${m % 60} daq`;
}

export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function relativeTime(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "hozirgina";
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  if (diff < 172800) return "kecha";
  return new Date(ts).toLocaleDateString("uz-UZ", { day: "numeric", month: "short" });
}

export function plural(n, word) {
  return `${n} ta ${word}`;
}

// ---------- word rendering ----------
export const levelBadge = (lvl) => `<span class="badge lvl lvl-${esc(lvl)}">${esc(lvl)}</span>`;

export function germanHtml(w) {
  return `${w.article ? `<span class="art art-${esc(w.article)}">${esc(w.article)}</span> ` : ""}${esc(w.german)}`;
}

export function exampleHtml(w) {
  return `<div class="word-example">${esc(w.example_de)}<em>${esc(w.example_uz)}</em></div>`;
}

export function isFavorite(id) {
  return getState().favorites.includes(id);
}

export function favButton(w, size = "sm") {
  const on = isFavorite(w.id);
  return `<button class="icon-btn ${size} ${on ? "on" : ""}" data-action="fav" data-id="${w.id}" aria-pressed="${on}"
    aria-label="${on ? "Sevimlilardan olib tashlash" : "Sevimlilarga qo‘shish"}" title="Sevimli">${icon("heart")}</button>`;
}

export const speakButton = (w, size = "sm") =>
  `<button class="icon-btn ${size}" data-action="speak" data-id="${w.id}" aria-label="Talaffuzni eshitish" title="Talaffuz">${icon("volume-2")}</button>`;

export function wordCardHtml(w, { learnButton = false, extra = "" } = {}) {
  const learned = Boolean(getState().learned[w.id]);
  return `<article class="card word-card ${learned ? "learned" : ""}" data-word="${w.id}">
    <div class="word-top">
      <div><div class="word-de">${germanHtml(w)}</div><div class="word-ipa">${esc(w.pronunciation)}</div></div>
      <div class="row">${speakButton(w)}${favButton(w)}</div>
    </div>
    <div class="word-uz">${esc(w.uzbek)}</div>
    ${exampleHtml(w)}
    <div class="word-meta">${levelBadge(w.level)}<span class="badge">${esc(w.topic)}</span><span class="badge">${esc(w.part_of_speech)}</span></div>
    ${learnButton || extra ? `<div class="word-actions">${extra}${learnButton ? (learned
      ? `<span class="badge green grow">${icon("check")} O‘rganilgan</span>`
      : `<button class="btn btn-sm btn-primary grow" data-action="learn" data-id="${w.id}">${icon("check")} O‘rgandim</button>`) : ""}</div>` : ""}
  </article>`;
}

// ---------- practice pools ----------
export const SOURCES = [
  { value: "all", label: "Barcha so‘zlar" },
  { value: "daily", label: "Bugungi so‘zlar" },
  { value: "learned", label: "O‘rganilganlar" },
  { value: "new", label: "Yangi so‘zlar" },
  { value: "favorites", label: "Sevimlilar" },
  { value: "difficult", label: "Qiyin so‘zlar" },
];

export function getPool(ctx, { source = "all", level = "", topic = "" } = {}) {
  const s = getState();
  let pool = ctx.words;
  if (source === "daily") pool = s.dailyWords.ids.map((id) => ctx.byId.get(id)).filter(Boolean);
  else if (source === "learned") pool = pool.filter((w) => s.learned[w.id]);
  else if (source === "new") pool = pool.filter((w) => !s.learned[w.id]);
  else if (source === "favorites") pool = s.favorites.map((id) => ctx.byId.get(id)).filter(Boolean);
  else if (source === "difficult") pool = Object.keys(s.difficult).map((id) => ctx.byId.get(Number(id))).filter(Boolean);
  if (level) pool = pool.filter((w) => w.level === level);
  if (topic) pool = pool.filter((w) => w.topic === topic);
  return pool;
}

export function practiceFilters(ctx, { source = "all", level = "" } = {}, extra = "") {
  return `<div class="filters" data-practice-filters>
    <div class="field"><label for="pf-source">Manba</label><select class="select" id="pf-source" name="source">
      ${SOURCES.map((o) => `<option value="${o.value}" ${o.value === source ? "selected" : ""}>${o.label}</option>`).join("")}</select></div>
    <div class="field"><label for="pf-level">Daraja</label><select class="select" id="pf-level" name="level">
      <option value="">Barcha darajalar</option>
      ${LEVELS.map((l) => `<option value="${l}" ${l === level ? "selected" : ""}>${l} — ${LEVEL_NAMES[l]}</option>`).join("")}</select></div>
    ${extra}
  </div>`;
}

export function bindPracticeFilters(root, ctx, route, current = {}) {
  root.querySelectorAll("[data-practice-filters] select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const params = { ...current };
      root.querySelectorAll("[data-practice-filters] select").forEach((s) => { if (s.value) params[s.name] = s.value; else delete params[s.name]; });
      ctx.navigate(route, params);
    });
  });
}

export function emptyState(iconName, title, text, action = "") {
  return `<div class="empty"><div class="empty-icon">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export function ringHtml(value, max, label, sub) {
  const r = 40, c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  return `<div class="ring" role="img" aria-label="${esc(sub)}: ${value} / ${max}">
    <svg viewBox="0 0 96 96"><circle class="track" cx="48" cy="48" r="${r}"/>
    <circle class="value" cx="48" cy="48" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>
    <div class="ring-label"><div>${esc(label)}<small>${esc(sub)}</small></div></div></div>`;
}
