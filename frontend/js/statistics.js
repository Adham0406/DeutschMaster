// Statistics page: KPIs, charts (Chart.js) and per-level progress.
import { addDays, getState, todayKey } from "./storage.js";
import { esc, formatDuration, icon, icons, LEVELS, LEVEL_NAMES } from "./ui.js";
import { ACHIEVEMENTS, learnedCount, levelInfo } from "./gamification.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const SHORT_DAYS = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

export function totals(s = getState()) {
  const days = Object.values(s.dailyProgress);
  const sum = (f) => days.reduce((a, d) => a + (d[f] || 0), 0);
  return { correct: sum("correct"), wrong: sum("wrong"), seconds: sum("seconds"), sessions: sum("sessions"), xp: s.xp };
}

export function lastDays(n, s = getState()) {
  const today = todayKey();
  return Array.from({ length: n }, (_, i) => {
    const key = addDays(today, i - n + 1);
    const d = s.dailyProgress[key] || {};
    const [y, m, dd] = key.split("-").map(Number);
    const date = new Date(y, m - 1, dd);
    return { key, label: `${SHORT_DAYS[date.getDay()]} ${dd}`, learned: d.learned || 0, correct: d.correct || 0, wrong: d.wrong || 0, xp: d.xp || 0, seconds: d.seconds || 0 };
  });
}

export function lastWeeks(n, s = getState()) {
  const days = lastDays(n * 7, s);
  return Array.from({ length: n }, (_, i) => {
    const chunk = days.slice(i * 7, i * 7 + 7);
    const [, m, d] = chunk[0].key.split("-").map(Number);
    return { label: `${d}.${String(m).padStart(2, "0")}`, xp: chunk.reduce((a, x) => a + x.xp, 0),
      learned: chunk.reduce((a, x) => a + x.learned, 0), answers: chunk.reduce((a, x) => a + x.correct + x.wrong, 0) };
  });
}

function baseOptions(stacked = false) {
  const grid = css("--chart-grid"), axis = css("--chart-axis");
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "#0f1d33", padding: 10, cornerRadius: 8, titleFont: { weight: "600" }, boxPadding: 4 },
    },
    scales: {
      x: { stacked, grid: { display: false }, border: { color: grid }, ticks: { color: axis, font: { size: 11 }, maxRotation: 0, autoSkip: true } },
      y: { stacked, beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: axis, font: { size: 11 }, precision: 0 } },
    },
  };
}

const bar = (color) => ({ backgroundColor: color, borderRadius: 4, borderSkipped: "bottom", maxBarThickness: 28, borderWidth: { top: 2 }, borderColor: css("--chart-surface") });

export default {
  title: "Statistika",
  subtitle: "O‘qish natijalaringiz va faolligingiz",
  render(view, ctx) {
    const s = getState();
    const t = totals(s);
    const lv = levelInfo(s.xp);
    const accuracy = t.correct + t.wrong ? Math.round((t.correct / (t.correct + t.wrong)) * 100) : 0;
    const quizzes = s.quizHistory.filter((q) => q.mode.startsWith("quiz"));
    const charts = [];
    const days = lastDays(14, s);
    const weeks = lastWeeks(8, s);
    const s1 = css("--series-1"), s2 = css("--series-2");

    const learnedBy = (lvl) => Object.keys(s.learned).filter((id) => ctx.byId.get(Number(id))?.level === lvl).length;
    const levelCount = (lvl) => ctx.words.filter((w) => w.level === lvl).length;

    view.innerHTML = `<div class="page-head"><div><h2>Statistika</h2><p>Barcha ma’lumotlar shu brauzerda saqlanadi</p></div></div>
      <div class="grid grid-4">
        ${kpi("book-check", "", "O‘rganilgan so‘zlar", learnedCount(s), `${ctx.words.length} tadan`)}
        ${kpi("target", "blue", "Aniqlik", `${accuracy}%`, `${t.correct} to‘g‘ri · ${t.wrong} xato`)}
        ${kpi("flame", "amber", "Streak", `${s.streak.current} kun`, `Eng uzun: ${s.streak.best} kun`)}
        ${kpi("clock", "rose", "O‘qish vaqti", formatDuration(t.seconds), `${t.sessions} ta mashg‘ulot`)}
      </div>
      <div class="grid grid-2 mt">
        <div class="card"><div class="card-head"><div><h3>Kunlik faollik</h3><p>So‘nggi 14 kun · javoblar soni</p></div></div>
          <div class="legend"><span><i style="background:${s1}"></i>To‘g‘ri</span><span><i style="background:${s2}"></i>Noto‘g‘ri</span></div>
          <div class="chart-box"><canvas id="ch-daily" aria-label="Kunlik to‘g‘ri va noto‘g‘ri javoblar"></canvas></div></div>
        <div class="card"><div class="card-head"><div><h3>Haftalik faollik</h3><p>So‘nggi 8 hafta · to‘plangan XP</p></div></div>
          <div class="chart-box"><canvas id="ch-weekly" aria-label="Haftalik XP"></canvas></div></div>
        <div class="card"><div class="card-head"><div><h3>Test natijalari</h3><p>So‘nggi 15 quiz · to‘g‘ri javoblar foizi</p></div></div>
          <div class="chart-box"><canvas id="ch-quiz" aria-label="Quiz natijalari"></canvas></div></div>
        <div class="card"><div class="card-head"><div><h3>Darajalar bo‘yicha progress</h3><p>O‘rganilgan / jami so‘zlar</p></div></div>
          ${LEVELS.map((l) => {
            const total = levelCount(l), done = learnedBy(l), pct = total ? Math.round((done / total) * 100) : 0;
            return `<div class="level-row"><span class="badge lvl lvl-${l}">${l}</span><div><div class="small text-2">${LEVEL_NAMES[l]}</div><div class="bar thin"><span style="width:${pct}%"></span></div></div><b class="small">${done}/${total}</b></div>`;
          }).join("")}</div>
      </div>
      <div class="grid grid-2 mt">
        <div class="card"><div class="card-head"><div><h3>Daraja va XP</h3><p>${lv.current} / ${lv.needed} XP keyingi darajagacha</p></div><span class="badge green">Lv ${lv.level}</span></div>
          <div class="bar lg"><span style="width:${Math.round(lv.progress * 100)}%"></span></div>
          <p class="small muted mt">Jami: <b>${s.xp}</b> XP</p></div>
        <div class="card"><div class="card-head"><h3>So‘nggi mashg‘ulotlar</h3></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Sana</th><th>Turi</th><th>Natija</th><th>Vaqt</th></tr></thead><tbody>
          ${s.quizHistory.slice(-6).reverse().map((q) => `<tr><td>${esc(new Date(q.at).toLocaleDateString("uz-UZ"))}</td><td>${esc(modeName(q.mode))}</td><td>${q.correct}/${q.total}</td><td>${formatDuration(q.durationSec)}</td></tr>`).join("")
            || `<tr><td colspan="4" class="muted">Hali mashg‘ulot yo‘q</td></tr>`}</tbody></table></div></div>
      </div>
      <div class="card mt"><div class="card-head"><h3>Yutuqlar</h3><p>${Object.keys(s.achievements).length} / ${ACHIEVEMENTS.length}</p></div>
        <div class="ach-grid">${ACHIEVEMENTS.map((a) => `<div class="ach ${s.achievements[a.id] ? "unlocked" : ""}">
          <div class="ach-icon">${icon(s.achievements[a.id] ? a.icon : "lock")}</div><h4>${a.title}</h4><p>${a.desc}</p></div>`).join("")}</div></div>
      <details class="card mt"><summary class="small text-2" style="cursor:pointer">Jadval ko‘rinishi (kunlik ma’lumotlar)</summary>
        <div class="table-wrap mt"><table class="table"><thead><tr><th>Kun</th><th>Yangi so‘z</th><th>To‘g‘ri</th><th>Xato</th><th>XP</th><th>Vaqt</th></tr></thead>
        <tbody>${days.slice().reverse().map((d) => `<tr><td>${d.key}</td><td>${d.learned}</td><td>${d.correct}</td><td>${d.wrong}</td><td>${d.xp}</td><td>${formatDuration(d.seconds)}</td></tr>`).join("")}</tbody></table></div></details>`;
    icons(view);

    if (!window.Chart) {
      view.querySelectorAll(".chart-box").forEach((b) => { b.innerHTML = `<div class="chart-fallback">Grafik kutubxonasi yuklanmadi. Ma’lumotlarni pastdagi jadvalda ko‘ring.</div>`; });
      return;
    }
    const Chart = window.Chart;
    charts.push(new Chart(view.querySelector("#ch-daily"), {
      type: "bar",
      data: { labels: days.map((d) => d.label), datasets: [
        { label: "To‘g‘ri", data: days.map((d) => d.correct), ...bar(s1) },
        { label: "Noto‘g‘ri", data: days.map((d) => d.wrong), ...bar(s2) },
      ] },
      options: baseOptions(true),
    }));
    charts.push(new Chart(view.querySelector("#ch-weekly"), {
      type: "bar",
      data: { labels: weeks.map((w) => w.label), datasets: [{ label: "XP", data: weeks.map((w) => w.xp), ...bar(s1) }] },
      options: baseOptions(),
    }));
    const recent = quizzes.slice(-15);
    const quizOpts = baseOptions();
    quizOpts.scales.y.max = 100;
    quizOpts.scales.y.ticks.callback = (v) => `${v}%`;
    charts.push(new Chart(view.querySelector("#ch-quiz"), {
      type: "line",
      data: { labels: recent.map((q, i) => `#${quizzes.length - recent.length + i + 1}`), datasets: [{
        label: "Natija", data: recent.map((q) => Math.round((q.correct / q.total) * 100)),
        borderColor: s1, backgroundColor: s1, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: css("--chart-surface"), pointBorderWidth: 2, tension: 0.25,
      }] },
      options: quizOpts,
    }));
    const emptyNote = (id, text) => view.querySelector(id).parentElement.insertAdjacentHTML("beforeend",
      `<div class="chart-fallback" style="position:absolute;inset:0;pointer-events:none">${text}</div>`);
    if (!recent.length) emptyNote("#ch-quiz", "Hali quiz topshirilmagan");
    if (!days.some((d) => d.correct + d.wrong)) emptyNote("#ch-daily", "So‘nggi 14 kunda javob berilmagan");
    if (!weeks.some((w) => w.xp)) emptyNote("#ch-weekly", "Hali XP to‘planmagan");
    return () => charts.forEach((c) => c.destroy());
  },
};

function kpi(iconName, tone, label, value, sub) {
  return `<div class="card stat"><div class="stat-icon ${tone}">${icon(iconName)}</div><div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div></div>`;
}

export function modeName(mode) {
  return { "quiz-de-uz": "Quiz DE→UZ", "quiz-uz-de": "Quiz UZ→DE", writing: "So‘z yozish", matching: "Moslashtirish", revision: "Takrorlash" }[mode] || mode;
}
