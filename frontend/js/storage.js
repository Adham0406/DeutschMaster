// Persistent user state in localStorage (single versioned key).
// All reads/writes go through this module so a server-side store can replace it later.

const KEY = "deutschmaster:v1";
export const SCHEMA_VERSION = 1;
const LIMITS = { quizHistory: 200, activity: 60, mastered: 200 };

export function todayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return todayKey(new Date(y, m - 1, d + days));
}

export function defaultSettings() {
  return { theme: "system", volume: 0.9, rate: 0.9, dailyGoal: 10 };
}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    learned: {},          // { [wordId]: { at: timestamp } }
    favorites: [],        // [wordId]
    difficult: {},        // { [wordId]: { wrong, right, streak, lastWrong } }
    mastered: [],         // [{ id, at }] words that left the difficult list
    xp: 0,
    level: 1,
    achievements: {},     // { [achievementId]: timestamp }
    dailyProgress: {},    // { "YYYY-MM-DD": { learned, correct, wrong, xp, seconds, sessions } }
    dailyWords: { date: null, ids: [], filters: { level: "", topic: "" } },
    seenDaily: [],        // word ids already suggested on earlier days
    streak: { current: 0, best: 0, lastActive: null },
    settings: defaultSettings(),
    revision: {},         // { [wordId]: { ease, interval, reps, lapses, due, last, lastGrade } }
    quizHistory: [],      // [{ at, mode, total, correct, durationSec }]
    activity: [],         // [{ at, type, text }]
  };
}

let state = null;
let storageOk = true;
const listeners = new Set();

function readRaw() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    storageOk = false;
    return null;
  }
}

export function isPersistent() {
  return storageOk;
}

export function load() {
  const raw = readRaw();
  let parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  }
  const result = parsed ? validateState(parsed) : null;
  state = result && result.ok ? result.data : defaultState();
  return state;
}

export function getState() {
  if (!state) load();
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false; // private mode / quota: keep working in memory
  }
}

export function update(mutator) {
  const s = getState();
  const result = mutator(s);
  save();
  listeners.forEach((fn) => fn(s));
  return result;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function dayStats(s, key = todayKey()) {
  if (!s.dailyProgress[key]) {
    s.dailyProgress[key] = { learned: 0, correct: 0, wrong: 0, xp: 0, seconds: 0, sessions: 0 };
  }
  return s.dailyProgress[key];
}

export function pushLimited(list, item, name) {
  list.push(item);
  const max = LIMITS[name];
  if (max && list.length > max) list.splice(0, list.length - max);
}

// ---------- validation (used for load + import) ----------
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isIdKey = (k) => /^\d+$/.test(k);
const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);

export function validateState(input) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ["Ma’lumot obyekt emas"] };
  const out = defaultState();
  const field = (name, check, msg) => {
    if (input[name] === undefined) return false;
    if (!check(input[name])) { errors.push(msg || `'${name}' maydoni noto‘g‘ri formatda`); return false; }
    return true;
  };

  if (field("learned", isObj)) {
    for (const [k, v] of Object.entries(input.learned)) {
      if (isIdKey(k) && isObj(v) && isNum(v.at)) out.learned[k] = { at: v.at };
      else errors.push(`learned[${k}] noto‘g‘ri`);
    }
  }
  if (field("favorites", Array.isArray)) out.favorites = [...new Set(input.favorites.filter(Number.isInteger))];
  if (field("difficult", isObj)) {
    for (const [k, v] of Object.entries(input.difficult)) {
      if (isIdKey(k) && isObj(v) && isNum(v.wrong)) {
        out.difficult[k] = { wrong: v.wrong, right: isNum(v.right) ? v.right : 0,
          streak: isNum(v.streak) ? v.streak : 0, lastWrong: isNum(v.lastWrong) ? v.lastWrong : 0 };
      } else errors.push(`difficult[${k}] noto‘g‘ri`);
    }
  }
  if (field("mastered", Array.isArray)) out.mastered = input.mastered.filter((m) => isObj(m) && Number.isInteger(m.id) && isNum(m.at));
  if (field("xp", (v) => isNum(v) && v >= 0, "'xp' manfiy bo‘lmagan son bo‘lishi kerak")) out.xp = Math.floor(input.xp);
  if (field("level", (v) => Number.isInteger(v) && v >= 1)) out.level = input.level;
  if (field("achievements", isObj)) {
    for (const [k, v] of Object.entries(input.achievements)) if (isNum(v)) out.achievements[k] = v;
  }
  if (field("dailyProgress", isObj)) {
    for (const [k, v] of Object.entries(input.dailyProgress)) {
      if (!isDateKey(k) || !isObj(v)) { errors.push(`dailyProgress[${k}] noto‘g‘ri`); continue; }
      const day = { learned: 0, correct: 0, wrong: 0, xp: 0, seconds: 0, sessions: 0 };
      for (const f of Object.keys(day)) if (isNum(v[f]) && v[f] >= 0) day[f] = v[f];
      out.dailyProgress[k] = day;
    }
  }
  if (field("dailyWords", isObj)) {
    const dw = input.dailyWords;
    out.dailyWords = {
      date: typeof dw.date === "string" && isDateKey(dw.date) ? dw.date : null,
      ids: Array.isArray(dw.ids) ? dw.ids.filter(Number.isInteger) : [],
      filters: isObj(dw.filters) ? { level: String(dw.filters.level || ""), topic: String(dw.filters.topic || "") } : { level: "", topic: "" },
    };
  }
  if (field("seenDaily", Array.isArray)) out.seenDaily = input.seenDaily.filter(Number.isInteger);
  if (field("streak", isObj)) {
    const st = input.streak;
    out.streak = {
      current: isNum(st.current) && st.current >= 0 ? st.current : 0,
      best: isNum(st.best) && st.best >= 0 ? st.best : 0,
      lastActive: typeof st.lastActive === "string" && isDateKey(st.lastActive) ? st.lastActive : null,
    };
  }
  if (field("settings", isObj)) {
    const st = input.settings;
    if (["system", "light", "dark"].includes(st.theme)) out.settings.theme = st.theme;
    if (isNum(st.volume) && st.volume >= 0 && st.volume <= 1) out.settings.volume = st.volume;
    if (isNum(st.rate) && st.rate >= 0.5 && st.rate <= 1.5) out.settings.rate = st.rate;
    if (Number.isInteger(st.dailyGoal) && st.dailyGoal >= 1 && st.dailyGoal <= 200) out.settings.dailyGoal = st.dailyGoal;
  }
  if (field("revision", isObj)) {
    for (const [k, v] of Object.entries(input.revision)) {
      if (isIdKey(k) && isObj(v) && isNum(v.due) && isNum(v.ease) && isNum(v.interval)) {
        out.revision[k] = { ease: v.ease, interval: v.interval, reps: isNum(v.reps) ? v.reps : 0,
          lapses: isNum(v.lapses) ? v.lapses : 0, due: v.due, last: isNum(v.last) ? v.last : 0,
          lastGrade: isNum(v.lastGrade) ? v.lastGrade : null };
      } else errors.push(`revision[${k}] noto‘g‘ri`);
    }
  }
  if (field("quizHistory", Array.isArray)) {
    out.quizHistory = input.quizHistory.filter((q) => isObj(q) && isNum(q.at) && typeof q.mode === "string"
      && isNum(q.total) && isNum(q.correct)).slice(-LIMITS.quizHistory);
  }
  if (field("activity", Array.isArray)) {
    out.activity = input.activity.filter((a) => isObj(a) && isNum(a.at) && typeof a.text === "string")
      .map((a) => ({ at: a.at, type: String(a.type || "info"), text: a.text.slice(0, 200) })).slice(-LIMITS.activity);
  }
  return { ok: errors.length === 0, errors, data: out };
}

// ---------- export / import / reset ----------
export function exportData() {
  return JSON.stringify({ app: "DeutschMaster", version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: getState() }, null, 2);
}

export function parseImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, errors: ["Fayl JSON formatida emas"] }; }
  if (!isObj(obj) || obj.app !== "DeutschMaster" || !isObj(obj.data)) {
    return { ok: false, errors: ["Bu fayl DeutschMaster eksport fayli emas"] };
  }
  if (obj.version !== SCHEMA_VERSION) return { ok: false, errors: [`Qo‘llab-quvvatlanmaydigan versiya: ${obj.version}`] };
  return validateState(obj.data);
}

export function replaceState(data) {
  state = data;
  save();
  listeners.forEach((fn) => fn(state));
}

export function resetAll() {
  const keepTheme = getState().settings.theme;
  state = defaultState();
  state.settings.theme = keepTheme;
  save();
  listeners.forEach((fn) => fn(state));
}
