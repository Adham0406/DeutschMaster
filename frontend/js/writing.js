// Word Writing page: show Uzbek, type German, automatic checking.
import { bindPracticeFilters, emptyState, esc, exampleHtml, germanHtml, getPool, icon, icons, levelBadge,
  practiceFilters, shuffle, speak } from "./ui.js";
import { finishSession, recordAnswer, XP } from "./gamification.js";

const ARTICLES = ["der", "die", "das"];

/** Typing helpers: ae/oe/ue/ss are accepted as ä/ö/ü/ß (keyboards without umlauts). */
export function normalizeAnswer(text) {
  return String(text || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

/**
 * Returns { ok, reason }. Accepts the word with or without its article;
 * if an article is typed it must be the right one.
 */
export function checkAnswer(input, word) {
  const raw = normalizeAnswer(input);
  if (!raw) return { ok: false, reason: "empty" };
  const target = normalizeAnswer(word.german);
  const parts = raw.split(" ");
  if (word.article && ARTICLES.includes(parts[0]) && parts.length > 1) {
    const rest = parts.slice(1).join(" ");
    if (rest === target) return parts[0] === word.article ? { ok: true, reason: "exact" } : { ok: false, reason: "article" };
  }
  if (raw === target) return { ok: true, reason: word.article ? "no-article" : "exact" };
  return { ok: false, reason: "wrong" };
}

export default {
  title: "So‘z yozish",
  subtitle: "O‘zbekcha tarjimaga qarab nemischa so‘zni yozing",
  render(view, ctx) {
    const params = { source: ctx.params.source || "all", level: ctx.params.level || "" };
    const ROUND = 10;
    let items = shuffle(getPool(ctx, params)).slice(0, ROUND);
    let index = 0, result = null, correct = 0, xp = 0, hintLevel = 0, value = "";
    const started = Date.now();

    function head() {
      return `<div class="page-head"><div><h2>So‘z yozish</h2><p>To‘g‘ri javob uchun +${XP.writingCorrect} XP. Umlaut o‘rniga ae/oe/ue/ss ham qabul qilinadi.</p></div></div>
        <div class="card flat" style="margin-bottom:20px">${practiceFilters(ctx, params)}</div>`;
    }

    function hint(w) {
      if (hintLevel === 0) return "";
      const letters = w.german.slice(0, hintLevel);
      return `<p class="small text-2 mt">Maslahat: ${w.article ? `<b>${esc(w.article)}</b> ` : ""}<b>${esc(letters)}</b>${"·".repeat(Math.max(0, w.german.length - hintLevel))} (${w.german.length} harf)</p>`;
    }

    function render() {
      if (!items.length) {
        view.innerHTML = head() + `<div class="card">${emptyState("pen-line", "So‘z topilmadi", "Boshqa manba yoki darajani tanlang.")}</div>`;
        icons(view); bindPracticeFilters(view, ctx, "writing"); return;
      }
      if (index >= items.length) {
        view.innerHTML = head() + `<div class="card pad-lg quiz-card"><div class="result-hero"><div class="muted small">Natija</div>
          <div class="score">${correct}<small> / ${items.length}</small></div><p class="text-2 mt">+${xp} XP</p></div>
          <div class="flash-controls"><button class="btn btn-primary" id="wr-again">${icon("rotate-ccw")} Yangi raund</button></div></div>`;
        icons(view); bindPracticeFilters(view, ctx, "writing");
        view.querySelector("#wr-again").addEventListener("click", () => {
          items = shuffle(getPool(ctx, params)).slice(0, ROUND); index = 0; correct = 0; xp = 0; result = null; value = ""; render();
        });
        return;
      }
      const w = items[index];
      let feedback = "";
      if (result) {
        const msgs = {
          exact: "To‘g‘ri!", "no-article": `To‘g‘ri! Artikl bilan: ${w.article} ${w.german}`,
          article: `Artikl noto‘g‘ri. To‘g‘ri javob: ${w.article} ${w.german}`, wrong: "Noto‘g‘ri.",
        };
        feedback = `<div class="explain ${result.ok ? "ok" : "bad"}">${icon(result.ok ? "check-circle-2" : "x-circle")}
          <div><b>${esc(msgs[result.reason])}</b>${result.ok ? "" : ` To‘g‘ri javob: <b>${germanHtml(w)}</b>`}<div class="mt">${exampleHtml(w)}</div></div></div>
          <div class="flash-controls"><button class="btn btn-primary" id="wr-next">${index === items.length - 1 ? "Natija" : "Keyingi"} ${icon("arrow-right")}</button></div>`;
      }
      view.innerHTML = head() + `<div class="card pad-lg quiz-card">
        <div class="row between"><span class="badge blue">${index + 1} / ${items.length}</span><div class="row">${levelBadge(w.level)}<span class="badge">${esc(w.part_of_speech)}</span></div></div>
        <div class="question">${esc(w.uzbek)}</div>
        <p class="center small muted">${w.article ? "Ot — artikl bilan yozsangiz ham bo‘ladi" : w.part_of_speech === "Verb" ? "Fe’l — infinitiv shaklida" : "Sifat"}</p>
        <form id="wr-form" class="mt stack" autocomplete="off">
          <input class="input input-lg ${result ? (result.ok ? "ok" : "bad") : ""}" id="wr-input" placeholder="Nemischa so‘zni yozing…" aria-label="Javob" value="${esc(value)}" ${result ? "readonly" : ""} spellcheck="false" autocapitalize="off">
          <div class="row between"><div class="umlauts">${["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"].map((c) => `<button type="button" data-ch="${c}" ${result ? "disabled" : ""}>${c}</button>`).join("")}</div>
            <div class="row">${result ? "" : `<button type="button" class="btn btn-ghost btn-sm" id="wr-hint">${icon("lightbulb")} Maslahat</button>
              <button type="button" class="btn btn-ghost btn-sm" id="wr-skip">O‘tkazib yuborish</button>
              <button type="submit" class="btn btn-primary">${icon("check")} Tekshirish</button>`}</div></div>
          ${result ? "" : hint(w)}
        </form>${feedback}</div>`;
      icons(view);
      bindPracticeFilters(view, ctx, "writing");
      const input = view.querySelector("#wr-input");
      if (!result) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      input.addEventListener("input", () => { value = input.value; });
      view.querySelector("#wr-form").addEventListener("submit", (e) => { e.preventDefault(); if (!result) check(input.value); else next(); });
      view.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
        const pos = input.selectionStart ?? input.value.length;
        input.value = input.value.slice(0, pos) + b.dataset.ch + input.value.slice(input.selectionEnd ?? pos);
        value = input.value;
        input.focus();
        input.setSelectionRange(pos + 1, pos + 1);
      }));
      view.querySelector("#wr-hint")?.addEventListener("click", () => { hintLevel = Math.min(w.german.length - 1, hintLevel + 1); render(); });
      view.querySelector("#wr-skip")?.addEventListener("click", () => check(""));
      const nextBtn = view.querySelector("#wr-next");
      if (nextBtn) { nextBtn.addEventListener("click", next); nextBtn.focus(); }
    }

    function check(text) {
      const w = items[index];
      result = checkAnswer(text, w);
      if (result.reason === "empty") result = { ok: false, reason: "wrong" };
      if (result.ok) correct += 1;
      // hints halve the reward
      xp += recordAnswer(w, result.ok, { xp: hintLevel ? Math.round(XP.writingCorrect / 2) : XP.writingCorrect });
      speak(w);
      render();
    }

    function next() {
      index += 1; result = null; hintLevel = 0; value = "";
      if (index >= items.length) {
        xp += finishSession({ mode: "writing", total: items.length, correct, durationSec: (Date.now() - started) / 1000, label: "So‘z yozish" });
      }
      render();
    }

    render();
  },
};
