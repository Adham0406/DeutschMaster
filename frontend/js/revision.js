// Spaced repetition (simplified SM-2) + Revision page.
import { getState, update } from "./storage.js";
import { esc, exampleHtml, germanHtml, icon, icons, levelBadge, speak, speakButton, emptyState, toast } from "./ui.js";
import { recordAnswer, finishSession } from "./gamification.js";

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;
export const GRADES = [
  { value: 0, key: "1", label: "Qayta", cls: "again" },
  { value: 1, key: "2", label: "Qiyin", cls: "hard" },
  { value: 2, key: "3", label: "Yaxshi", cls: "good" },
  { value: 3, key: "4", label: "Oson", cls: "easy" },
];

export const newCard = (now = Date.now()) => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, last: 0, lastGrade: null });

/**
 * Pure scheduling function. grade: 0 again, 1 hard, 2 good, 3 easy.
 * - again: back in 10 minutes, ease drops, repetition count resets
 * - hard: short growth, ease drops a little
 * - good: 1d -> 3d -> interval*ease
 * - easy: longer intervals, ease grows
 */
export function schedule(card, grade, now = Date.now()) {
  const c = { ...newCard(now), ...card };
  if (grade === 0) {
    c.reps = 0;
    c.lapses += 1;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.interval = 0;
    c.due = now + 10 * MINUTE;
  } else {
    if (grade === 1) {
      c.ease = Math.max(1.3, c.ease - 0.15);
      c.interval = c.reps === 0 ? 1 : Math.max(c.interval + 1, Math.round(c.interval * 1.2));
    } else if (grade === 2) {
      c.interval = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.max(c.interval + 1, Math.round(c.interval * c.ease));
    } else {
      c.ease = c.ease + 0.15;
      c.interval = c.reps === 0 ? 3 : c.reps === 1 ? 6 : Math.max(c.interval + 2, Math.round(c.interval * c.ease * 1.3));
    }
    c.reps += 1;
    c.due = now + c.interval * DAY;
  }
  c.last = now;
  c.lastGrade = grade;
  return c;
}

export function intervalLabel(card, grade, now = Date.now()) {
  const next = schedule(card, grade, now);
  const ms = next.due - now;
  if (ms < DAY) return `${Math.round(ms / MINUTE)} daq`;
  return `${Math.round(ms / DAY)} kun`;
}

// Mutating helpers used inside storage.update()
export function ensureCard(s, id, { dueInDays = 0 } = {}) {
  if (!s.revision[id]) {
    const c = newCard();
    c.due = Date.now() + dueInDays * DAY;
    s.revision[id] = c;
  }
  return s.revision[id];
}

export function gradeCard(s, id, grade) {
  s.revision[id] = schedule(s.revision[id] || newCard(), grade);
  return s.revision[id];
}

export function dueIds(s = getState(), now = Date.now()) {
  return Object.entries(s.revision).filter(([, c]) => c.due <= now).sort((a, b) => a[1].due - b[1].due).map(([id]) => Number(id));
}

export function upcoming(s = getState(), now = Date.now()) {
  const buckets = [
    { label: "Hozir", max: 0 }, { label: "Bugun", max: DAY }, { label: "Ertaga", max: 2 * DAY },
    { label: "3–7 kun", max: 7 * DAY }, { label: "7+ kun", max: Infinity },
  ];
  const counts = buckets.map(() => 0);
  for (const c of Object.values(s.revision)) {
    const diff = c.due - now;
    const i = buckets.findIndex((b) => diff <= b.max);
    counts[i] += 1;
  }
  return buckets.map((b, i) => ({ label: b.label, count: counts[i] }));
}

// ---------- page ----------
export default {
  title: "Takrorlash",
  subtitle: "Spaced repetition: qiyin so‘zlar tez-tez, osonlari kamroq takrorlanadi",
  render(view, ctx) {
    let queue = dueIds().map((id) => ctx.byId.get(id)).filter(Boolean);
    let index = 0, revealed = false;
    const remembered = new Set();
    const started = Date.now();
    const total = queue.length;

    function scheduleTable() {
      const s = getState();
      const rows = Object.entries(s.revision).sort((a, b) => a[1].due - b[1].due).slice(0, 12)
        .map(([id, c]) => {
          const w = ctx.byId.get(Number(id));
          if (!w) return "";
          const when = c.due <= Date.now() ? `<span class="badge amber">Hozir</span>` : esc(new Date(c.due).toLocaleString("uz-UZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
          return `<tr><td><b>${esc(w.german)}</b></td><td>${levelBadge(w.level)}</td><td>${when}</td><td>${c.interval} kun</td><td>${c.ease.toFixed(2)}</td><td>${c.lapses}</td></tr>`;
        }).join("");
      return `<div class="card"><div class="card-head"><div><h3>Takrorlash jadvali</h3><p>Eng yaqin 12 ta so‘z</p></div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>So‘z</th><th>Daraja</th><th>Keyingi</th><th>Oraliq</th><th>Ease</th><th>Xato</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">Jadval bo‘sh — so‘z o‘rgansangiz, u shu yerga qo‘shiladi.</td></tr>`}</tbody></table></div></div>`;
    }

    function upcomingCard() {
      return `<div class="card"><div class="card-head"><h3>Kelgusi takrorlashlar</h3></div>
        ${upcoming().map((u) => `<div class="level-row"><b>${u.count}</b><span class="text-2">${u.label}</span><span></span></div>`).join("")}</div>`;
    }

    function render() {
      const w = queue[index];
      let main;
      if (!total) {
        main = `<div class="card">${emptyState("calendar-check", "Hozircha takrorlash yo‘q",
          "Yangi so‘zlarni o‘rganing yoki mashq qiling — so‘zlar o‘z vaqtida shu yerda paydo bo‘ladi.",
          `<a class="btn btn-primary" href="#/daily">${icon("sun")} Kunlik so‘zlar</a>`)}</div>`;
      } else if (!w) {
        main = `<div class="card">${emptyState("party-popper", "Takrorlash yakunlandi!",
          `${total} ta so‘zdan ${remembered.size} tasini birinchi urinishda esladingiz. Keyingi takrorlashlar jadvalga yozildi.`,
          `<a class="btn btn-primary" href="#/dashboard">${icon("layout-dashboard")} Dashboard</a>`)}</div>`;
      } else {
        const card = getState().revision[w.id] || newCard();
        main = `<div class="card pad-lg quiz-card">
          <div class="row between"><span class="badge blue">${index + 1} / ${queue.length}</span><div class="row">${levelBadge(w.level)}${speakButton(w)}</div></div>
          <div class="question" id="rev-q">${germanHtml(w)}</div>
          <div class="center word-ipa">${esc(w.pronunciation)}</div>
          ${revealed ? `<div class="mt center"><div class="word-uz" style="font-size:22px">${esc(w.uzbek)}</div></div><div class="mt">${exampleHtml(w)}</div>
            <div class="grade-row">${GRADES.map((g) => `<button class="btn grade-btn ${g.cls}" data-grade="${g.value}">${g.label}<small>${intervalLabel(card, g.value)} · ${g.key}</small></button>`).join("")}</div>`
          : `<div class="flash-controls"><button class="btn btn-primary btn-lg" id="rev-show">${icon("eye")} Javobni ko‘rsatish <span class="kbd">Space</span></button></div>`}
        </div>`;
      }
      view.innerHTML = `<div class="page-head"><div><h2>Takrorlash</h2><p>Bugun takrorlanishi kerak: <b>${total}</b> ta so‘z</p></div></div>
        <div class="grid grid-3"><div class="span-2">${main}</div>${upcomingCard()}</div>
        <div class="mt-lg">${scheduleTable()}</div>`;
      icons(view);
      view.querySelector("#rev-show")?.addEventListener("click", reveal);
      view.querySelectorAll("[data-grade]").forEach((b) => b.addEventListener("click", () => grade(Number(b.dataset.grade))));
      view.querySelector("[data-action=speak]")?.addEventListener("click", () => speak(w));
    }

    function reveal() { revealed = true; render(); }

    function grade(g) {
      const w = queue[index];
      update((s) => { gradeCard(s, w.id, g); });
      const firstTry = index < total;
      recordAnswer(w, g >= 1, { revise: false, learn: false });
      if (g >= 1 && firstTry) remembered.add(w.id);
      if (g === 0) queue.push(w); // see it again in this session
      index += 1;
      revealed = false;
      if (index >= queue.length) {
        const bonus = finishSession({ mode: "revision", total, correct: remembered.size, durationSec: (Date.now() - started) / 1000, label: "Takrorlash" });
        toast("Takrorlash tugadi", `+${bonus} XP bonus`, "xp");
      }
      render();
    }

    const onKey = (e) => {
      if (e.target.matches("input, textarea, select")) return;
      if (!queue[index]) return;
      if (!revealed && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); reveal(); }
      else if (revealed && ["1", "2", "3", "4"].includes(e.key)) grade(Number(e.key) - 1);
    };
    document.addEventListener("keydown", onKey);
    render();
    return () => document.removeEventListener("keydown", onKey);
  },
};
