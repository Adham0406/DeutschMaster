// Favorites and Difficult Words pages.
import { getState } from "./storage.js";
import { emptyState, esc, germanHtml, icon, icons, levelBadge, relativeTime, speakButton, favButton, wordCardHtml } from "./ui.js";
import { bindWordActions } from "./actions.js";
import { MASTER_STREAK, removeDifficult } from "./gamification.js";

const practiceLinks = (source) => `<div class="row">
  <a class="btn" href="#/flashcards?source=${source}">${icon("layers")} Flashcards</a>
  <a class="btn" href="#/writing?source=${source}">${icon("pen-line")} Yozish</a>
  <a class="btn" href="#/matching?source=${source}">${icon("puzzle")} O‘yin</a>
  <a class="btn btn-primary" href="#/quiz?source=${source}&quick=1">${icon("list-checks")} Test</a></div>`;

export const favorites = {
  title: "Sevimlilar",
  subtitle: "Saqlangan so‘zlaringiz — alohida o‘rganing",
  render(view, ctx) {
    function render() {
      const list = getState().favorites.map((id) => ctx.byId.get(id)).filter(Boolean);
      view.innerHTML = `<div class="page-head"><div><h2>Sevimlilar</h2><p>${list.length} ta so‘z</p></div>${list.length ? practiceLinks("favorites") : ""}</div>
        ${list.length ? `<div class="grid grid-3">${list.map((w) => wordCardHtml(w, { learnButton: true })).join("")}</div>`
          : `<div class="card">${emptyState("heart", "Sevimli so‘zlar yo‘q", "Istalgan so‘z kartasidagi yurakcha tugmasini bosib, so‘zni shu yerga qo‘shing.",
            `<a class="btn btn-primary" href="#/dictionary">${icon("book-open")} Lug‘atga o‘tish</a>`)}</div>`}`;
      icons(view);
    }
    bindWordActions(view, ctx, { onChange: (type, w, added) => { if (type === "fav" && !added) render(); } });
    render();
  },
};

export const difficult = {
  title: "Qiyin so‘zlar",
  subtitle: "Ko‘p xato qilingan so‘zlar — alohida mashq qiling",
  render(view, ctx) {
    function render() {
      const s = getState();
      const list = Object.entries(s.difficult).map(([id, d]) => ({ w: ctx.byId.get(Number(id)), d })).filter((x) => x.w)
        .sort((a, b) => b.d.wrong - a.d.wrong || b.d.lastWrong - a.d.lastWrong);
      const mastered = s.mastered.slice(-8).reverse().map((m) => ({ w: ctx.byId.get(m.id), at: m.at })).filter((x) => x.w);
      view.innerHTML = `<div class="page-head"><div><h2>Qiyin so‘zlar</h2><p>${list.length} ta so‘z · ketma-ket ${MASTER_STREAK} marta to‘g‘ri javob bersangiz, so‘z o‘zlashtirilgan hisoblanadi</p></div>${list.length ? practiceLinks("difficult") : ""}</div>
        <div class="grid grid-3"><div class="span-2"><div class="card">
          ${list.length ? `<div class="list">${list.map(({ w, d }) => `<div class="list-item">
            <div class="main-col"><div class="title">${germanHtml(w)}</div><div class="sub">${esc(w.uzbek)}</div></div>
            <div class="center small"><b style="color:var(--danger)">${d.wrong}</b><div class="muted">xato</div></div>
            <div style="width:90px"><div class="small muted">${d.streak}/${MASTER_STREAK}</div><div class="bar thin"><span style="width:${(d.streak / MASTER_STREAK) * 100}%"></span></div></div>
            ${levelBadge(w.level)}
            <div class="actions">${speakButton(w)}${favButton(w)}<button class="icon-btn sm" data-master="${w.id}" title="O‘zlashtirdim deb belgilash" aria-label="O‘zlashtirdim">${icon("check")}</button></div></div>`).join("")}</div>`
          : emptyState("badge-check", "Qiyin so‘zlar yo‘q", "Mashqlarda xato qilingan so‘zlar avtomatik ravishda shu yerga tushadi.",
            `<a class="btn btn-primary" href="#/quiz">${icon("list-checks")} Quiz boshlash</a>`)}
        </div></div>
        <div class="card"><div class="card-head"><h3>O‘zlashtirilgan</h3></div>
          ${mastered.length ? `<div class="list">${mastered.map(({ w, at }) => `<div class="list-item"><div class="main-col"><div class="title">${esc(w.german)}</div><div class="sub">${relativeTime(at)}</div></div><span class="badge green">${icon("check")}</span></div>`).join("")}</div>`
            : `<p class="small muted">Qiyin ro‘yxatdan chiqqan so‘zlar shu yerda ko‘rinadi.</p>`}</div></div>`;
      icons(view);
      view.querySelectorAll("[data-master]").forEach((b) => b.addEventListener("click", () => { removeDifficult(ctx.byId.get(Number(b.dataset.master))); render(); }));
    }
    bindWordActions(view, ctx);
    render();
  },
};
