// XP, levels, streaks, achievements, difficult-word tracking and activity log.
import { addDays, dayStats, getState, pushLimited, todayKey, update } from "./storage.js";
import { toast } from "./ui.js";
import { ensureCard, gradeCard } from "./revision.js";

export const XP = { newWord: 5, correct: 10, writingCorrect: 15, sessionBonus: 20, perfectBonus: 30 };
export const MASTER_STREAK = 3; // correct answers in a row that remove a word from "difficult"

export const ACHIEVEMENTS = [
  { id: "first_word", title: "First Word", desc: "Birinchi so‘zni o‘rganing", icon: "sprout", check: (s) => learnedCount(s) >= 1 },
  { id: "words_10", title: "10 Words", desc: "10 ta so‘z o‘rganing", icon: "book-open", check: (s) => learnedCount(s) >= 10 },
  { id: "words_50", title: "50 Words", desc: "50 ta so‘z o‘rganing", icon: "library", check: (s) => learnedCount(s) >= 50 },
  { id: "words_100", title: "100 Words", desc: "100 ta so‘z o‘rganing", icon: "graduation-cap", check: (s) => learnedCount(s) >= 100 },
  { id: "perfect_quiz", title: "Perfect Quiz", desc: "Kamida 5 savollik quizda 100%", icon: "target",
    check: (s) => s.quizHistory.some((q) => q.mode.startsWith("quiz") && q.total >= 5 && q.correct === q.total) },
  { id: "streak_3", title: "3 Day Streak", desc: "3 kun ketma-ket o‘qing", icon: "flame", check: (s) => s.streak.best >= 3 },
  { id: "streak_7", title: "7 Day Streak", desc: "7 kun ketma-ket o‘qing", icon: "trophy", check: (s) => s.streak.best >= 7 },
];

export const learnedCount = (s = getState()) => Object.keys(s.learned).length;

export const xpForLevel = (level) => 100 + (level - 1) * 50; // XP needed to go from level -> level+1

export function levelInfo(xp) {
  let level = 1, rest = xp;
  while (rest >= xpForLevel(level)) { rest -= xpForLevel(level); level++; }
  const needed = xpForLevel(level);
  return { level, current: rest, needed, progress: rest / needed };
}

// ---------- internal helpers (operate on the mutable state inside update()) ----------
function touchStreak(s) {
  const today = todayKey();
  const st = s.streak;
  if (st.lastActive === today) return;
  st.current = st.lastActive === addDays(today, -1) ? st.current + 1 : 1;
  st.lastActive = today;
  st.best = Math.max(st.best, st.current);
}

function gainXp(s, amount) {
  if (amount <= 0) return;
  const before = levelInfo(s.xp).level;
  s.xp += amount;
  dayStats(s).xp += amount;
  const after = levelInfo(s.xp).level;
  s.level = after;
  if (after > before) {
    log(s, "level", `${after}-darajaga ko‘tarildingiz`);
    setTimeout(() => toast(`Yangi daraja: ${after}!`, "Ajoyib natija, davom eting.", "xp", 4000), 0);
  }
}

function log(s, type, text) {
  pushLimited(s.activity, { at: Date.now(), type, text }, "activity");
}

function checkAchievements(s) {
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements[a.id] && a.check(s)) {
      s.achievements[a.id] = Date.now();
      log(s, "achievement", `Yutuq ochildi: ${a.title}`);
      setTimeout(() => toast(`Yutuq: ${a.title}`, a.desc, "xp", 4500), 0);
    }
  }
}

// ---------- public actions ----------
export function refreshStreak() {
  // A missed day resets the visible streak (best is kept).
  const s = getState();
  const today = todayKey();
  if (s.streak.lastActive && s.streak.lastActive !== today && s.streak.lastActive !== addDays(today, -1) && s.streak.current !== 0) {
    update((st) => { st.streak.current = 0; });
  }
}

export function learnWord(word) {
  return update((s) => {
    if (s.learned[word.id]) return false;
    s.learned[word.id] = { at: Date.now() };
    dayStats(s).learned += 1;
    touchStreak(s);
    gainXp(s, XP.newWord);
    ensureCard(s, word.id, { dueInDays: 1 });
    log(s, "learn", `Yangi so‘z: ${word.article ? word.article + " " : ""}${word.german}`);
    checkAchievements(s);
    return true;
  });
}

/** Records one answer in any exercise. Returns XP gained. */
export function recordAnswer(word, correct, { xp = XP.correct, learn = true, revise = true } = {}) {
  let gained = 0;
  let masteredNow = false;
  update((s) => {
    const day = dayStats(s);
    touchStreak(s);
    if (correct) {
      day.correct += 1;
      gained = xp;
      gainXp(s, xp);
      const d = s.difficult[word.id];
      if (d) {
        d.right += 1;
        d.streak += 1;
        if (d.streak >= MASTER_STREAK) {
          delete s.difficult[word.id];
          pushLimited(s.mastered, { id: word.id, at: Date.now() }, "mastered");
          log(s, "mastered", `O‘zlashtirildi: ${word.german}`);
          masteredNow = true;
        }
      }
      if (learn && !s.learned[word.id]) {
        s.learned[word.id] = { at: Date.now() };
        day.learned += 1;
        gainXp(s, XP.newWord);
        gained += XP.newWord;
        ensureCard(s, word.id, { dueInDays: 1 });
      }
    } else {
      day.wrong += 1;
      const d = s.difficult[word.id] || { wrong: 0, right: 0, streak: 0, lastWrong: 0 };
      d.wrong += 1;
      d.streak = 0;
      d.lastWrong = Date.now();
      s.difficult[word.id] = d;
      if (revise) gradeCard(s, word.id, 0); // bring it back into revision soon
    }
    checkAchievements(s);
  });
  if (masteredNow) toast("So‘z o‘zlashtirildi", `${word.german} qiyin so‘zlar ro‘yxatidan chiqarildi.`, "success");
  return gained;
}

export function markDifficult(word) {
  update((s) => {
    const d = s.difficult[word.id] || { wrong: 0, right: 0, streak: 0, lastWrong: 0 };
    d.wrong += 1;
    d.streak = 0;
    d.lastWrong = Date.now();
    s.difficult[word.id] = d;
    touchStreak(s);
  });
}

export function removeDifficult(word) {
  update((s) => {
    if (!s.difficult[word.id]) return;
    delete s.difficult[word.id];
    pushLimited(s.mastered, { id: word.id, at: Date.now() }, "mastered");
    log(s, "mastered", `O‘zlashtirildi: ${word.german}`);
  });
}

/** Called at the end of a quiz / writing / matching session. Returns bonus XP. */
export function finishSession({ mode, total, correct, durationSec = 0, label }) {
  let bonus = 0;
  update((s) => {
    pushLimited(s.quizHistory, { at: Date.now(), mode, total, correct, durationSec: Math.round(durationSec) }, "quizHistory");
    dayStats(s).sessions += 1;
    touchStreak(s);
    if (total > 0) {
      bonus = XP.sessionBonus + (correct === total && total >= 5 ? XP.perfectBonus : 0);
      gainXp(s, bonus);
    }
    log(s, "session", `${label || mode}: ${correct}/${total}`);
    checkAchievements(s);
  });
  return bonus;
}

export function toggleFavorite(word) {
  let added = false;
  update((s) => {
    const i = s.favorites.indexOf(word.id);
    if (i >= 0) s.favorites.splice(i, 1);
    else { s.favorites.push(word.id); added = true; }
  });
  return added;
}

// ---------- study-time tracking ----------
let lastInteraction = Date.now();
const TICK = 15;
export function startTimeTracking() {
  ["pointerdown", "keydown", "scroll", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, () => { lastInteraction = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastInteraction > 120000) return; // idle > 2 min is not study time
    update((s) => { dayStats(s).seconds += TICK; });
  }, TICK * 1000);
}
