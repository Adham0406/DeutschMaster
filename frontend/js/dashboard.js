// Dashboard: today, totals, streak, goal, overall progress, recent activity, quick practice.
import { getState, todayKey } from "./storage.js";
import { esc, formatDuration, icon, icons, LEVELS, relativeTime, ringHtml } from "./ui.js";
import { ACHIEVEMENTS, learnedCount, levelInfo } from "./gamification.js";
import { dueIds } from "./revision.js";
import { totals } from "./statistics.js";

const ACTIVITY_ICONS = { learn: "sprout", session: "list-checks", achievement: "award", level: "zap", mastered: "badge-check", info: "info" };

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Xayrli tun" : h < 12 ? "Xayrli tong" : h < 18 ? "Xayrli kun" : "Xayrli kech";
}

export default {
  title: "Dashboard",
  subtitle: "Bugungi holat va tezkor mashqlar",
  render(view, ctx) {
    const s = getState();
    const today = s.dailyProgress[todayKey()] || { learned: 0, correct: 0, wrong: 0, xp: 0, seconds: 0, sessions: 0 };
    const goal = s.settings.dailyGoal;
    const total = learnedCount(s);
    const lv = levelInfo(s.xp);
    const due = dueIds(s).length;
    const t = totals(s);
    const pct = ctx.words.length ? Math.round((total / ctx.words.length) * 100) : 0;
    const perLevel = LEVELS.map((l) => {
      const all = ctx.words.filter((w) => w.level === l);
      const done = all.filter((w) => s.learned[w.id]).length;
      return { l, done, all: all.length };
    });
    const goalDone = today.learned >= goal;

    view.innerHTML = `
      <section class="hero">
        <div><h2>${greeting()}!</h2>
          <p>${goalDone ? "Bugungi maqsad bajarildi — ajoyib! Takrorlash bilan bilimingizni mustahkamlang." :
            `Bugungi maqsad: <b>${goal}</b> ta so‘z. Yana <b>${goal - today.learned}</b> ta qoldi.`}</p></div>
        <div class="row"><a class="btn btn-primary btn-lg" href="#/daily">${icon("sun")} Kunlik so‘zlar</a>
          <a class="btn btn-lg" href="#/revision">${icon("repeat")} Takrorlash${due ? ` (${due})` : ""}</a></div>
      </section>
      <div class="grid grid-4 mt">
        <div class="card stat"><div class="stat-icon">${icon("sparkles")}</div><div><div class="stat-label">Bugun o‘rganildi</div><div class="stat-value">${today.learned}</div><div class="stat-sub">${today.correct} to‘g‘ri · ${today.wrong} xato javob</div></div></div>
        <div class="card stat"><div class="stat-icon blue">${icon("book-check")}</div><div><div class="stat-label">Jami o‘rganilgan</div><div class="stat-value">${total}</div><div class="stat-sub">${ctx.words.length} ta so‘zdan</div></div></div>
        <div class="card stat"><div class="stat-icon rose">${icon("clock")}</div><div><div class="stat-label">O‘qish vaqti</div><div class="stat-value">${formatDuration(today.seconds)}</div><div class="stat-sub">Jami: ${formatDuration(t.seconds)}</div></div></div>
        <div class="card stat"><div class="stat-icon amber">${icon("flame")}</div><div><div class="stat-label">Streak</div><div class="stat-value">${s.streak.current} kun</div><div class="stat-sub">Eng uzun: ${s.streak.best} kun</div></div></div>
      </div>
      <div class="grid grid-3 mt">
        <div class="card"><div class="card-head"><div><h3>Kunlik maqsad</h3><p>Sozlamalarda o‘zgartirish mumkin</p></div></div>
          <div class="row" style="gap:20px;flex-wrap:nowrap">${ringHtml(today.learned, goal, `${Math.min(today.learned, goal)}/${goal}`, "so‘z")}
          <div class="stack" style="gap:6px"><div class="small text-2">${goalDone ? `${icon("check-circle-2")} Maqsad bajarildi` : "Davom eting!"}</div>
            <div class="small muted">Bugungi XP: <b>${today.xp}</b></div><div class="small muted">Mashg‘ulotlar: <b>${today.sessions}</b></div></div></div></div>
        <div class="card"><div class="card-head"><div><h3>Umumiy progress</h3><p>${total} / ${ctx.words.length} so‘z · ${pct}%</p></div></div>
          <div class="bar lg"><span style="width:${pct}%"></span></div>
          <div class="mt">${perLevel.map((x) => `<div class="level-row"><span class="badge lvl lvl-${x.l}">${x.l}</span><div class="bar thin"><span style="width:${x.all ? (x.done / x.all) * 100 : 0}%"></span></div><span class="small muted">${x.done}/${x.all}</span></div>`).join("")}</div></div>
        <div class="card"><div class="card-head"><div><h3>Daraja ${lv.level}</h3><p>${lv.current} / ${lv.needed} XP</p></div><span class="badge green">${icon("zap")} ${s.xp} XP</span></div>
          <div class="bar lg"><span style="width:${Math.round(lv.progress * 100)}%"></span></div>
          <p class="small muted mt">Keyingi darajagacha ${lv.needed - lv.current} XP qoldi.</p>
          <div class="mt small text-2">Yutuqlar: <b>${Object.keys(s.achievements).length}</b> / ${ACHIEVEMENTS.length} · <a href="#/statistics">Barchasini ko‘rish</a></div></div>
      </div>
      <div class="grid grid-2 mt">
        <div class="card"><div class="card-head"><h3>Tezkor mashq</h3></div>
          <div class="quick-grid">
            <a class="quick" href="#/quiz?quick=1&count=5">${icon("zap")}<div><b>5 savollik quiz</b><span>2 daqiqalik mashq</span></div></a>
            <a class="quick" href="#/flashcards?source=new">${icon("layers")}<div><b>Yangi kartalar</b><span>O‘rganilmagan so‘zlar</span></div></a>
            <a class="quick" href="#/matching">${icon("puzzle")}<div><b>Moslashtirish</b><span>Vaqtga qarshi o‘yin</span></div></a>
            <a class="quick" href="#/writing?source=learned">${icon("pen-line")}<div><b>So‘z yozish</b><span>O‘rganilganlarni mustahkamlash</span></div></a>
          </div></div>
        <div class="card"><div class="card-head"><h3>So‘nggi faoliyat</h3></div>
          ${s.activity.length ? s.activity.slice(-6).reverse().map((a) => `<div class="activity-item"><div class="activity-dot">${icon(ACTIVITY_ICONS[a.type] || "info")}</div>
            <div><div class="t">${esc(a.text)}</div><div class="d">${relativeTime(a.at)}</div></div></div>`).join("")
            : `<p class="small muted">Hali faoliyat yo‘q. Kunlik so‘zlardan boshlang!</p>`}</div>
      </div>`;
    icons(view);
  },
};
