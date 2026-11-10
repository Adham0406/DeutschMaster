// DeutschMaster — application bootstrap and hash router.
import { api } from "./api.js";
import { getState, load, subscribe } from "./storage.js";
import { emptyState, esc, icon, icons } from "./ui.js";
import { levelInfo, refreshStreak, startTimeTracking } from "./gamification.js";
import { applyTheme, toggleTheme } from "./theme.js";
import { dueIds } from "./revision.js";
import revision from "./revision.js";
import dashboard from "./dashboard.js";
import daily from "./daily.js";
import flashcards from "./flashcards.js";
import quiz from "./quiz.js";
import writing from "./writing.js";
import matching from "./matching.js";
import dictionary from "./dictionary.js";
import { difficult, favorites } from "./collections.js";
import statistics from "./statistics.js";
import settings from "./settings.js";

const ROUTES = { dashboard, daily, flashcards, quiz, writing, matching, revision, dictionary, favorites, difficult, statistics, settings };
const DEFAULT_ROUTE = "dashboard";

const ctx = { words: [], byId: new Map(), topics: [], params: {}, navigate };
let cleanup = null;
let currentRoute = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [name, query = ""] = raw.split("?");
  return { name: ROUTES[name] ? name : DEFAULT_ROUTE, params: Object.fromEntries(new URLSearchParams(query)), known: !name || Boolean(ROUTES[name]) };
}

export function navigate(name, params = {}) {
  const q = new URLSearchParams(params).toString();
  const hash = `#/${name}${q ? `?${q}` : ""}`;
  if (location.hash === hash) render(); else location.hash = hash;
}

function render() {
  const { name, params, known } = parseHash();
  if (!known) { history.replaceState(null, "", `#/${DEFAULT_ROUTE}`); }
  if (typeof cleanup === "function") { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  if (window.speechSynthesis) window.speechSynthesis.cancel();

  const page = ROUTES[name];
  ctx.params = params;
  const view = document.getElementById("view");
  // A fresh container per page: listeners attached by the previous page die with it.
  const container = document.createElement("div");
  view.replaceChildren(container);
  document.getElementById("page-title").textContent = page.title;
  document.getElementById("page-subtitle").textContent = page.subtitle || "";
  document.title = `${page.title} · DeutschMaster`;
  document.querySelectorAll(".nav-link").forEach((a) => {
    const active = a.dataset.route === name;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  closeSidebar();
  if (currentRoute !== name) window.scrollTo(0, 0);
  currentRoute = name;
  try {
    cleanup = page.render(container, ctx);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="card">${emptyState("bug", "Sahifani ochishda xatolik", esc(err.message))}</div>`;
    icons(container);
  }
}

function updateChrome() {
  const s = getState();
  const lv = levelInfo(s.xp);
  document.querySelector("#top-xp span").innerHTML = `<span class="pill-text">Lv </span>${lv.level}<span class="pill-text"> · ${s.xp} XP</span>`;
  document.querySelector("#top-streak span").innerHTML = `${s.streak.current}<span class="pill-text"> kun</span>`;
  document.getElementById("sidebar-level").innerHTML = `<div class="row between"><span>Daraja <strong>${lv.level}</strong></span><span>${lv.current}/${lv.needed} XP</span></div>
    <div class="bar thin"><span style="width:${Math.round(lv.progress * 100)}%"></span></div>`;
  const setCount = (id, n) => { const e = document.getElementById(id); e.hidden = !n; e.textContent = n; };
  setCount("nav-due", dueIds(s).length);
  setCount("nav-fav", s.favorites.length);
  setCount("nav-diff", Object.keys(s.difficult).length);
}

// ---------- sidebar (mobile) ----------
const sidebar = () => document.getElementById("sidebar");
function openSidebar() {
  sidebar().classList.add("open");
  document.getElementById("overlay").classList.add("show");
  document.getElementById("menu-btn").setAttribute("aria-expanded", "true");
}
function closeSidebar() {
  sidebar().classList.remove("open");
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("menu-btn").setAttribute("aria-expanded", "false");
}

async function boot() {
  load();
  applyTheme();
  refreshStreak();
  icons();
  document.getElementById("menu-btn").addEventListener("click", () => (sidebar().classList.contains("open") ? closeSidebar() : openSidebar()));
  document.getElementById("overlay").addEventListener("click", closeSidebar);
  document.getElementById("theme-btn").addEventListener("click", toggleTheme);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });
  document.addEventListener("themechange", () => { if (currentRoute === "statistics") render(); });

  const view = document.getElementById("view");
  view.innerHTML = `<div class="empty"><div class="empty-icon">${icon("loader")}</div><h3>Yuklanmoqda…</h3></div>`;
  icons(view);
  try {
    const [words, topics] = await Promise.all([api.words(), api.topics()]);
    ctx.words = words;
    ctx.byId = new Map(words.map((w) => [w.id, w]));
    ctx.topics = topics;
  } catch (err) {
    view.innerHTML = `<div class="card">${emptyState("server-off", "Ma’lumotlarni yuklab bo‘lmadi", `${err.message}. Internet aloqasini tekshiring va sahifani yangilang.`,
      `<button class="btn btn-primary" id="retry">${icon("refresh-cw")} Qayta urinish</button>`)}</div>`;
    icons(view);
    document.getElementById("retry").addEventListener("click", () => location.reload());
    return;
  }
  subscribe(updateChrome);
  updateChrome();
  startTimeTracking();
  window.addEventListener("hashchange", render);
  render();
  document.documentElement.dataset.ready = "true"; // used by automated browser tests
}

boot();
