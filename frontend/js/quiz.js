// Quiz page: DE->UZ or UZ->DE, 4 options, explanation, final result.
import { bindPracticeFilters, emptyState, esc, exampleHtml, germanHtml, getPool, icon, icons, levelBadge,
  practiceFilters, shuffle, speak, spoken } from "./ui.js";
import { finishSession, recordAnswer, XP } from "./gamification.js";

const MIN_POOL = 4;

export function buildQuestion(word, allWords, direction) {
  const answerOf = (w) => (direction === "de-uz" ? w.uzbek : spoken(w));
  const correct = answerOf(word);
  // Prefer distractors of the same level and part of speech, then anything else.
  const ranked = shuffle(allWords.filter((w) => w.id !== word.id && answerOf(w) !== correct))
    .sort((a, b) => score(b) - score(a));
  function score(w) { return (w.level === word.level ? 2 : 0) + (w.part_of_speech === word.part_of_speech ? 1 : 0); }
  const options = [];
  for (const w of ranked) {
    if (!options.includes(answerOf(w))) options.push(answerOf(w));
    if (options.length === 3) break;
  }
  return { word, prompt: direction === "de-uz" ? word : null, correct, options: shuffle([correct, ...options]) };
}

export default {
  title: "Quiz",
  subtitle: "4 ta variantdan to‘g‘risini tanlang",
  render(view, ctx) {
    const params = {
      source: ctx.params.source || "all",
      level: ctx.params.level || "",
      dir: ctx.params.dir === "uz-de" ? "uz-de" : "de-uz",
      count: [5, 10, 20].includes(Number(ctx.params.count)) ? Number(ctx.params.count) : 10,
    };
    const pool = getPool(ctx, params);
    let questions = [], index = 0, answered = null, correctCount = 0, started = 0, mistakes = [], gainedXp = 0;
    const onKeyRef = { fn: null };

    function head() {
      const extra = `
        <div class="field"><label for="pf-dir">Yo‘nalish</label><select class="select" id="pf-dir" name="dir">
          <option value="de-uz" ${params.dir === "de-uz" ? "selected" : ""}>Nemischa → O‘zbekcha</option>
          <option value="uz-de" ${params.dir === "uz-de" ? "selected" : ""}>O‘zbekcha → Nemischa</option></select></div>
        <div class="field"><label for="pf-count">Savollar</label><select class="select" id="pf-count" name="count">
          ${[5, 10, 20].map((n) => `<option value="${n}" ${n === params.count ? "selected" : ""}>${n} ta</option>`).join("")}</select></div>`;
      return `<div class="page-head"><div><h2>Quiz</h2><p>${params.dir === "de-uz" ? "Nemischa so‘zning o‘zbekcha tarjimasini" : "O‘zbekcha so‘zning nemischa tarjimasini"} toping</p></div></div>
        <div class="card flat" style="margin-bottom:20px">${practiceFilters(ctx, params, extra)}</div>`;
    }

    function start() {
      questions = shuffle(pool).slice(0, params.count).map((w) => buildQuestion(w, ctx.words, params.dir));
      index = 0; answered = null; correctCount = 0; mistakes = []; gainedXp = 0; started = Date.now();
      if (!questions.length) return renderSetup();
      renderQuestion();
    }

    function bindHead() { bindPracticeFilters(view, ctx, "quiz", params); }

    function renderSetup() {
      const enough = pool.length >= 1 && ctx.words.length >= MIN_POOL;
      view.innerHTML = head() + `<div class="card pad-lg quiz-card">${enough
        ? `<div class="center stack"><div class="empty-icon" style="margin:0 auto">${icon("list-checks")}</div>
            <h3>Quizga tayyormisiz?</h3><p class="text-2">${Math.min(params.count, pool.length)} ta savol · har bir to‘g‘ri javob uchun +${XP.correct} XP</p>
            <div><button class="btn btn-primary btn-lg" id="quiz-start">${icon("play")} Boshlash</button></div></div>`
        : emptyState("list-checks", "Savollar uchun so‘z yetarli emas", "Boshqa manba yoki darajani tanlang.")}</div>`;
      icons(view);
      bindHead();
      view.querySelector("#quiz-start")?.addEventListener("click", start);
    }

    function renderQuestion() {
      const q = questions[index];
      const w = q.word;
      const promptHtml = params.dir === "de-uz"
        ? `<div class="question">${germanHtml(w)}</div><div class="center word-ipa">${esc(w.pronunciation)}</div>`
        : `<div class="question">${esc(w.uzbek)}</div><div class="center muted small">${esc(w.part_of_speech)}</div>`;
      const opts = q.options.map((o, i) => {
        let cls = "";
        if (answered !== null) {
          if (o === q.correct) cls = "correct";
          else if (i === answered) cls = "wrong";
        }
        return `<button class="option ${cls}" data-i="${i}" ${answered !== null ? "disabled" : ""}><span class="key">${i + 1}</span><span>${esc(o)}</span></button>`;
      }).join("");
      let explain = "";
      if (answered !== null) {
        const ok = q.options[answered] === q.correct;
        explain = `<div class="explain ${ok ? "ok" : "bad"}">${icon(ok ? "check-circle-2" : "x-circle")}
          <div><b>${ok ? "To‘g‘ri!" : "Noto‘g‘ri."}</b> ${germanHtml(w)} — ${esc(w.uzbek)}
          <div class="mt">${exampleHtml(w)}</div></div></div>
          <div class="flash-controls"><button class="btn btn-primary" id="quiz-next">${index === questions.length - 1 ? "Natijani ko‘rish" : "Keyingi savol"} ${icon("arrow-right")}</button></div>`;
      }
      view.innerHTML = head() + `<div class="card pad-lg quiz-card">
        <div class="row between"><span class="badge blue">Savol ${index + 1} / ${questions.length}</span>
          <div class="row">${levelBadge(w.level)}<button class="icon-btn sm" id="quiz-speak" aria-label="Talaffuz" ${params.dir === "uz-de" && answered === null ? "hidden" : ""}>${icon("volume-2")}</button></div></div>
        <div class="bar thin mt"><span style="width:${(index / questions.length) * 100}%"></span></div>
        <div class="mt">${promptHtml}</div>
        <div class="options">${opts}</div>${explain}</div>`;
      icons(view);
      bindHead();
      view.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => answer(Number(b.dataset.i))));
      view.querySelector("#quiz-speak")?.addEventListener("click", () => speak(w));
      view.querySelector("#quiz-next")?.addEventListener("click", next);
      view.querySelector("#quiz-next")?.focus();
    }

    function answer(i) {
      if (answered !== null) return;
      answered = i;
      const q = questions[index];
      const ok = q.options[i] === q.correct;
      if (ok) correctCount += 1; else mistakes.push(q.word);
      gainedXp += recordAnswer(q.word, ok, { xp: XP.correct });
      renderQuestion();
    }

    function next() {
      if (index < questions.length - 1) { index += 1; answered = null; renderQuestion(); }
      else renderResult();
    }

    function renderResult() {
      const total = questions.length;
      const duration = (Date.now() - started) / 1000;
      const bonus = finishSession({ mode: `quiz-${params.dir}`, total, correct: correctCount, durationSec: duration, label: "Quiz" });
      const pct = Math.round((correctCount / total) * 100);
      const msg = pct === 100 ? "Mukammal natija!" : pct >= 80 ? "Juda yaxshi!" : pct >= 50 ? "Yaxshi, davom eting." : "Mashq qilishda davom eting.";
      view.innerHTML = head() + `<div class="card pad-lg quiz-card">
        <div class="result-hero"><div class="muted small">Natija</div><div class="score">${correctCount}<small> / ${total}</small></div>
          <h3 class="mt">${msg}</h3><p class="text-2 mt">${pct}% to‘g‘ri · +${gainedXp + bonus} XP (shundan bonus ${bonus})</p></div>
        <div class="bar lg mt"><span style="width:${pct}%"></span></div>
        ${mistakes.length ? `<h4 class="mt-lg">Xato qilingan so‘zlar</h4><div class="list mt">${mistakes.map((w) =>
          `<div class="list-item"><div class="main-col"><div class="title">${germanHtml(w)}</div><div class="sub">${esc(w.uzbek)}</div></div>${levelBadge(w.level)}</div>`).join("")}</div>
          <p class="small muted mt">Bu so‘zlar “Qiyin so‘zlar” ro‘yxatiga qo‘shildi.</p>` : ""}
        <div class="flash-controls"><button class="btn btn-primary" id="quiz-again">${icon("rotate-ccw")} Qayta boshlash</button>
          ${mistakes.length ? `<a class="btn" href="#/difficult">${icon("flame")} Qiyin so‘zlar</a>` : ""}</div></div>`;
      icons(view);
      bindHead();
      view.querySelector("#quiz-again").addEventListener("click", start);
    }

    onKeyRef.fn = (e) => {
      if (e.target.matches("input, textarea, select") || !questions.length || index >= questions.length) return;
      if (answered === null && ["1", "2", "3", "4"].includes(e.key)) answer(Number(e.key) - 1);
    };
    document.addEventListener("keydown", onKeyRef.fn);
    if (ctx.params.quick) start(); else renderSetup();
    return () => document.removeEventListener("keydown", onKeyRef.fn);
  },
};
