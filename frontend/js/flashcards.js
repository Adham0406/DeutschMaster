// Flashcards page: flip cards, audio, prev/next, "I know" / "learn again".
import { getState, update } from "./storage.js";
import { bindPracticeFilters, emptyState, esc, exampleHtml, favButton, germanHtml, getPool, icon, icons, levelBadge,
  practiceFilters, shuffle, speak, toast } from "./ui.js";
import { learnWord, markDifficult, toggleFavorite } from "./gamification.js";
import { gradeCard } from "./revision.js";

export default {
  title: "Flashcards",
  subtitle: "Kartani bosing — tarjimasi ochiladi",
  render(view, ctx) {
    const params = { source: ctx.params.source || "all", level: ctx.params.level || "" };
    const cards = shuffle(getPool(ctx, params));
    let index = 0, flipped = false, known = 0, again = 0;

    function render() {
      const head = `<div class="page-head"><div><h2>Flashcards</h2><p>Old tomonda nemischa so‘z, orqa tomonda o‘zbekcha tarjima</p></div></div>
        <div class="card flat" style="margin-bottom:20px">${practiceFilters(ctx, params)}</div>`;
      if (!cards.length) {
        view.innerHTML = head + `<div class="card">${emptyState("layers", "Kartalar topilmadi",
          "Tanlangan manba bo‘yicha so‘z yo‘q. Boshqa manba yoki darajani tanlang.")}</div>`;
        icons(view);
        bindPracticeFilters(view, ctx, "flashcards");
        return;
      }
      const w = cards[index];
      const learned = Boolean(getState().learned[w.id]);
      view.innerHTML = head + `
        <div class="row between" style="max-width:620px;margin:0 auto 12px">
          <span class="badge blue">${index + 1} / ${cards.length}</span>
          <span class="small muted">Bilaman: <b>${known}</b> · Qayta: <b>${again}</b></span>
        </div>
        <div class="flash-wrap">
          <div class="flashcard ${flipped ? "flipped" : ""}" id="flashcard" role="button" tabindex="0" aria-label="Kartani aylantirish">
            <div class="flash-face front">
              <div class="corner">${levelBadge(w.level)}${learned ? `<span class="badge green">${icon("check")} O‘rganilgan</span>` : `<span class="badge">${esc(w.topic)}</span>`}</div>
              <div class="big">${germanHtml(w)}</div>
              <div class="word-ipa">${esc(w.pronunciation)}</div>
              <span class="badge">${esc(w.part_of_speech)}</span>
              <div class="flash-hint">${icon("rotate-3d")} Aylantirish uchun bosing yoki <span class="kbd">Space</span></div>
            </div>
            <div class="flash-face back">
              <div class="big">${esc(w.uzbek)}</div>
              <div>${exampleHtml(w)}</div>
              <div class="flash-hint">${icon("rotate-3d")} Orqaga qaytarish</div>
            </div>
          </div>
        </div>
        <div class="flash-controls">
          <button class="icon-btn" id="fc-prev" aria-label="Oldingi" ${index === 0 ? "disabled" : ""}>${icon("chevron-left")}</button>
          <button class="btn" id="fc-speak">${icon("volume-2")} Audio</button>
          ${favButton(w, "")}
          <button class="btn btn-danger" id="fc-again">${icon("rotate-ccw")} Qayta o‘rganaman</button>
          <button class="btn btn-primary" id="fc-know">${icon("check")} Bilaman</button>
          <button class="icon-btn" id="fc-next" aria-label="Keyingi" ${index === cards.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button>
        </div>
        <p class="center small muted mt">Klaviatura: <span class="kbd">←</span> <span class="kbd">→</span> o‘tish · <span class="kbd">Space</span> aylantirish · <span class="kbd">K</span> bilaman · <span class="kbd">R</span> qayta</p>`;
      icons(view);
      bindPracticeFilters(view, ctx, "flashcards");
      view.querySelector("#flashcard").addEventListener("click", flip);
      view.querySelector("#fc-prev").addEventListener("click", () => go(-1));
      view.querySelector("#fc-next").addEventListener("click", () => go(1));
      view.querySelector("#fc-speak").addEventListener("click", () => speak(w));
      view.querySelector("#fc-know").addEventListener("click", know);
      view.querySelector("#fc-again").addEventListener("click", learnAgain);
      view.querySelector("[data-action=fav]").addEventListener("click", () => {
        const added = toggleFavorite(w);
        toast(added ? "Sevimlilarga qo‘shildi" : "Sevimlilardan olib tashlandi", w.german, "success");
        render();
      });
    }

    function flip() { flipped = !flipped; view.querySelector("#flashcard")?.classList.toggle("flipped", flipped); }
    function go(step) {
      const next = index + step;
      if (next < 0 || next >= cards.length) return;
      index = next; flipped = false; render();
    }
    function advance() {
      if (index < cards.length - 1) { index += 1; flipped = false; render(); }
      else {
        flipped = false;
        render();
        toast("To‘plam tugadi", `Bilaman: ${known}, qayta o‘rganaman: ${again}`, "success");
      }
    }
    function know() {
      const w = cards[index];
      const isNew = learnWord(w);
      update((s) => { if (s.revision[w.id] && !isNew) gradeCard(s, w.id, 2); });
      known += 1;
      if (isNew) toast("Yangi so‘z o‘rganildi", `${w.german} · +5 XP`, "xp", 1800);
      advance();
    }
    function learnAgain() {
      const w = cards[index];
      markDifficult(w);
      update((s) => { gradeCard(s, w.id, 0); });
      again += 1;
      advance();
    }

    const onKey = (e) => {
      if (e.target.matches("input, textarea, select") || !cards.length) return;
      if (e.code === "Space" || e.key === "Enter") { if (e.target.closest(".flash-controls")) return; e.preventDefault(); flip(); }
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key.toLowerCase() === "k") know();
      else if (e.key.toLowerCase() === "r") learnAgain();
    };
    document.addEventListener("keydown", onKey);
    render();
    return () => document.removeEventListener("keydown", onKey);
  },
};
