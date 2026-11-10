// Daily Words: 10 new suggestions per day (not a hard limit), filters, no repeats.
import { getState, todayKey, update } from "./storage.js";
import { emptyState, esc, icon, icons, LEVELS, LEVEL_NAMES, wordCardHtml } from "./ui.js";
import { bindWordActions } from "./actions.js";

export const DAILY_COUNT = 10;
const MORE_COUNT = 5;

/**
 * Picks `count` words the user has not learned, preferring ones never suggested before,
 * then the lowest CEFR level first. Pure: returns ids, does not mutate state.
 */
export function pickWords(words, s, { count, level = "", topic = "", exclude = [] }) {
  const ex = new Set(exclude);
  const seen = new Set(s.seenDaily);
  const candidates = words.filter((w) => !s.learned[w.id] && !ex.has(w.id)
    && (!level || w.level === level) && (!topic || w.topic === topic));
  const rank = (w) => (seen.has(w.id) ? 100 : 0) + LEVELS.indexOf(w.level) * 10 + Math.random() * 9;
  return candidates.map((w) => [rank(w), w.id]).sort((a, b) => a[0] - b[0]).slice(0, count).map(([, id]) => id);
}

export function ensureToday(words) {
  const s = getState();
  const today = todayKey();
  if (s.dailyWords.date === today && s.dailyWords.ids.length) return;
  update((st) => {
    const filters = st.dailyWords.filters || { level: "", topic: "" };
    // words suggested on earlier days are remembered so tomorrow's set is different
    st.seenDaily = [...new Set([...st.seenDaily, ...st.dailyWords.ids])];
    const ids = pickWords(words, st, { count: DAILY_COUNT, ...filters });
    st.dailyWords = { date: today, ids, filters };
  });
}

export default {
  title: "Kunlik so‘zlar",
  subtitle: "Har kuni 10 ta yangi so‘z — xohlasangiz ko‘proq",
  render(view, ctx) {
    ensureToday(ctx.words);

    function render() {
      const s = getState();
      const { ids, filters } = s.dailyWords;
      const list = ids.map((id) => ctx.byId.get(id)).filter(Boolean);
      const learnedToday = list.filter((w) => s.learned[w.id]).length;
      const remaining = ctx.words.filter((w) => !s.learned[w.id] && !ids.includes(w.id)
        && (!filters.level || w.level === filters.level) && (!filters.topic || w.topic === filters.topic)).length;
      view.innerHTML = `<div class="page-head"><div><h2>Kunlik so‘zlar</h2>
          <p>Bugun: <b>${learnedToday}</b> / ${list.length} ta so‘z o‘rganildi</p></div>
          <div class="row"><a class="btn" href="#/flashcards?source=daily">${icon("layers")} Flashcards</a>
          <a class="btn btn-primary" href="#/quiz?source=daily&quick=1">${icon("list-checks")} Bugungi so‘zlardan test</a></div></div>
        <div class="card flat" style="margin-bottom:20px"><div class="filters">
          <div class="field"><label for="dw-level">Daraja</label><select class="select" id="dw-level"><option value="">Barcha darajalar</option>
            ${LEVELS.map((l) => `<option value="${l}" ${filters.level === l ? "selected" : ""}>${l} — ${LEVEL_NAMES[l]}</option>`).join("")}</select></div>
          <div class="field"><label for="dw-topic">Mavzu</label><select class="select" id="dw-topic"><option value="">Barcha mavzular</option>
            ${ctx.topics.map((t) => `<option value="${esc(t.code)}" ${filters.topic === t.code ? "selected" : ""}>${esc(t.name_de)} — ${esc(t.name_uz)}</option>`).join("")}</select></div>
          <button class="btn" id="dw-more" ${remaining ? "" : "disabled"}>${icon("plus")} Yana ${Math.min(MORE_COUNT, remaining) || ""} ta so‘z</button>
        </div><p class="small muted mt">Filtrni o‘zgartirsangiz, bugungi o‘rganilmagan so‘zlar shu filtr bo‘yicha yangilanadi. Mos keladigan yangi so‘zlar: ${remaining}</p></div>
        <div class="bar lg" style="margin-bottom:20px"><span style="width:${list.length ? (learnedToday / list.length) * 100 : 0}%"></span></div>
        ${list.length ? `<div class="grid grid-3" id="dw-list">${list.map((w) => wordCardHtml(w, { learnButton: true })).join("")}</div>`
          : `<div class="card">${emptyState("party-popper", "Bu filtr bo‘yicha yangi so‘z qolmadi",
            "Barcha mos so‘zlarni o‘rgangansiz. Boshqa daraja yoki mavzuni tanlang, yoki takrorlashga o‘ting.",
            `<a class="btn btn-primary" href="#/revision">${icon("repeat")} Takrorlash</a>`)}</div>`}`;
      icons(view);
      view.querySelector("#dw-level").addEventListener("change", applyFilters);
      view.querySelector("#dw-topic").addEventListener("change", applyFilters);
      view.querySelector("#dw-more").addEventListener("click", more);
    }

    function applyFilters() {
      const level = view.querySelector("#dw-level").value;
      const topic = view.querySelector("#dw-topic").value;
      update((s) => {
        const keep = s.dailyWords.ids.filter((id) => s.learned[id]);
        const fresh = pickWords(ctx.words, s, { count: Math.max(0, DAILY_COUNT - keep.length), level, topic, exclude: keep });
        s.dailyWords = { date: todayKey(), ids: [...keep, ...fresh], filters: { level, topic } };
      });
      render();
    }

    function more() {
      update((s) => {
        const fresh = pickWords(ctx.words, s, { count: MORE_COUNT, ...s.dailyWords.filters, exclude: s.dailyWords.ids });
        s.dailyWords.ids.push(...fresh);
      });
      render();
    }

    bindWordActions(view, ctx, { onChange: (type) => { if (type === "learn") render(); } });
    render();
  },
};
