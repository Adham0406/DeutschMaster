// Matching game: pair German words with Uzbek translations against the clock.
import { bindPracticeFilters, clock, emptyState, esc, getPool, icon, icons, practiceFilters, shuffle, speak } from "./ui.js";
import { finishSession, recordAnswer, XP } from "./gamification.js";
import { getState } from "./storage.js";

const PAIRS = 6;

export default {
  title: "Moslashtirish o‘yini",
  subtitle: "Nemischa so‘zni o‘zbekcha tarjimasi bilan juftlang",
  render(view, ctx) {
    const params = { source: ctx.params.source || "all", level: ctx.params.level || "" };
    let words = [], left = [], right = [], matched = new Set(), selected = null, mistakes = 0, startedAt = 0, timer = null, done = false;
    const mistaken = new Set();

    function bestTime() {
      const runs = getState().quizHistory.filter((q) => q.mode === "matching" && q.correct === q.total && q.total === PAIRS);
      return runs.length ? Math.min(...runs.map((r) => r.durationSec)) : null;
    }

    function newGame() {
      const pool = getPool(ctx, params);
      // Avoid two words with identical translations in one board.
      const seen = new Set();
      words = shuffle(pool).filter((w) => !seen.has(w.uzbek) && seen.add(w.uzbek)).slice(0, PAIRS);
      left = shuffle(words); right = shuffle(words);
      matched = new Set(); selected = null; mistakes = 0; done = false; mistaken.clear();
      startedAt = Date.now();
      clearInterval(timer);
      timer = setInterval(tick, 500);
      render();
    }

    function tick() {
      const t = view.querySelector("#mt-time");
      if (t && !done) t.textContent = clock((Date.now() - startedAt) / 1000);
    }

    function render() {
      const head = `<div class="page-head"><div><h2>Moslashtirish o‘yini</h2><p>Chapdan nemischa so‘zni, o‘ngdan tarjimasini tanlang</p></div>
        <div class="row"><span class="pill">${icon("timer")}<span class="timer" id="mt-time">${clock(done ? 0 : (Date.now() - startedAt) / 1000)}</span></span>
        <span class="pill">${icon("x")} ${mistakes}</span><button class="btn" id="mt-new">${icon("shuffle")} Aralashtirish</button></div></div>
        <div class="card flat" style="margin-bottom:20px">${practiceFilters(ctx, params)}</div>`;
      if (words.length < 2) {
        clearInterval(timer);
        view.innerHTML = head + `<div class="card">${emptyState("puzzle", "O‘yin uchun so‘z yetarli emas", "Kamida 2 ta so‘z kerak. Boshqa manba yoki darajani tanlang.")}</div>`;
        icons(view); bindPracticeFilters(view, ctx, "matching");
        view.querySelector("#mt-new").addEventListener("click", newGame);
        return;
      }
      const tile = (w, side) => {
        const isMatched = matched.has(w.id);
        const isSel = selected && selected.side === side && selected.id === w.id;
        const label = side === "de" ? `${w.article ? w.article + " " : ""}${w.german}` : w.uzbek;
        return `<button class="tile ${isMatched ? "matched" : ""} ${isSel ? "selected" : ""}" data-side="${side}" data-id="${w.id}" ${isMatched ? "disabled" : ""}>${esc(label)}</button>`;
      };
      view.innerHTML = head + `<div class="card"><div class="match-board">
          <div class="match-col"><div class="field-label">Deutsch</div>${left.map((w) => tile(w, "de")).join("")}</div>
          <div class="match-col"><div class="field-label">O‘zbekcha</div>${right.map((w) => tile(w, "uz")).join("")}</div>
        </div><p class="small muted mt">Topilgan juftliklar: <b>${matched.size}</b> / ${words.length}</p></div>`;
      icons(view);
      bindPracticeFilters(view, ctx, "matching");
      view.querySelector("#mt-new").addEventListener("click", newGame);
      view.querySelectorAll(".tile").forEach((b) => b.addEventListener("click", () => pick(b.dataset.side, Number(b.dataset.id), b)));
    }

    function pick(side, id, btn) {
      if (done || matched.has(id)) return;
      if (side === "de") speak(ctx.byId.get(id));
      if (!selected || selected.side === side) { selected = { side, id }; render(); return; }
      const word = ctx.byId.get(side === "de" ? id : selected.id);
      if (selected.id === id) {
        matched.add(id);
        // a pair counts as correct only if it was found without mistakes
        if (!mistaken.has(id)) recordAnswer(word, true, { xp: XP.correct });
        selected = null;
        if (matched.size === words.length) return finish();
        render();
      } else {
        mistakes += 1;
        const deId = side === "de" ? id : selected.id;
        mistaken.add(deId);
        recordAnswer(ctx.byId.get(deId), false);
        const other = view.querySelector(`.tile[data-side="${selected.side}"][data-id="${selected.id}"]`);
        [btn, other].forEach((b) => b && b.classList.add("shake"));
        selected = null;
        setTimeout(render, 380);
      }
    }

    function finish() {
      done = true;
      clearInterval(timer);
      const secs = (Date.now() - startedAt) / 1000;
      const prevBest = bestTime();
      const clean = words.length - mistaken.size;
      const bonus = finishSession({ mode: "matching", total: words.length, correct: clean, durationSec: secs, label: "Moslashtirish" });
      const record = clean === words.length && words.length === PAIRS && (prevBest === null || secs < prevBest);
      view.innerHTML = `<div class="page-head"><div><h2>Moslashtirish o‘yini</h2></div></div>
        <div class="card pad-lg quiz-card"><div class="result-hero"><div class="muted small">Vaqt</div>
        <div class="score">${clock(secs)}</div>
        <h3 class="mt">${record ? "Yangi rekord!" : mistakes === 0 ? "Xatosiz!" : "O‘yin tugadi"}</h3>
        <p class="text-2 mt">${words.length} ta juftlik · ${mistakes} ta xato · bonus +${bonus} XP</p>
        ${prevBest !== null ? `<p class="small muted mt">Oldingi eng yaxshi vaqt: ${clock(prevBest)}</p>` : ""}</div>
        <div class="flash-controls"><button class="btn btn-primary" id="mt-again">${icon("rotate-ccw")} Yana o‘ynash</button></div></div>`;
      icons(view);
      view.querySelector("#mt-again").addEventListener("click", newGame);
    }

    newGame();
    return () => clearInterval(timer);
  },
};
