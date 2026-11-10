// Dictionary: search DE/UZ (API with local fallback), level/topic filters, online translation.
import { api } from "./api.js";
import { esc, exampleHtml, favButton, germanHtml, icon, icons, LEVELS, levelBadge, speakButton, emptyState } from "./ui.js";
import { bindWordActions } from "./actions.js";
import { getState } from "./storage.js";

/** Local search used when the API is unreachable (same rules as backend, simplified). */
export function localSearch(words, q, { lang = "all", level = "", topic = "" } = {}) {
  const fold = (t) => String(t).toLowerCase().normalize("NFC").replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").trim();
  const query = fold(q);
  return words.filter((w) => (!level || w.level === level) && (!topic || w.topic === topic)).filter((w) => {
    const fields = [];
    if (lang !== "uz") fields.push(fold(w.german), fold(`${w.article} ${w.german}`));
    if (lang !== "de") fields.push(fold(w.uzbek));
    return fields.some((f) => f.includes(query));
  });
}

export default {
  title: "Lug‘at",
  subtitle: "Nemischa va o‘zbekcha qidiruv, talaffuz va misollar",
  render(view, ctx) {
    const state = { q: ctx.params.q || "", lang: "all", level: "", topic: "", results: ctx.words, open: new Set(), offline: false };
    let timer = null, seq = 0;

    view.innerHTML = `<div class="page-head"><div><h2>Lug‘at</h2><p>${ctx.words.length} ta so‘z · A1–C2</p></div></div>
      <div class="grid grid-3">
        <div class="span-2 stack">
          <div class="card flat"><div class="stack">
            <div class="input-icon">${icon("search")}<input class="input input-lg" id="dc-q" type="search" placeholder="Qidirish: Haus, ona, kitob…" value="${esc(state.q)}" aria-label="Qidiruv" autocomplete="off"></div>
            <div class="filters">
              <div class="field"><label for="dc-lang">Til</label><select class="select" id="dc-lang"><option value="all">Ikkala til</option><option value="de">Nemischa</option><option value="uz">O‘zbekcha</option></select></div>
              <div class="field"><label for="dc-level">Daraja</label><select class="select" id="dc-level"><option value="">Barchasi</option>${LEVELS.map((l) => `<option>${l}</option>`).join("")}</select></div>
              <div class="field"><label for="dc-topic">Mavzu</label><select class="select" id="dc-topic"><option value="">Barchasi</option>${ctx.topics.map((t) => `<option value="${esc(t.code)}">${esc(t.name_de)} — ${esc(t.name_uz)}</option>`).join("")}</select></div>
            </div></div></div>
          <div class="row between"><span class="small text-2" id="dc-count"></span><span class="badge amber" id="dc-offline" hidden>${icon("wifi-off")} Lokal qidiruv</span></div>
          <div id="dc-results"></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><div><h3>Onlayn tarjima</h3><p>Lingva API · ishlamasa lokal lug‘at</p></div></div>
            <form id="tr-form" class="stack" autocomplete="off">
              <div class="segmented" role="group" aria-label="Tarjima yo‘nalishi"><button type="button" class="active" data-dir="de">DE → UZ</button><button type="button" data-dir="uz">UZ → DE</button></div>
              <textarea class="input" id="tr-text" rows="3" maxlength="300" placeholder="Matn kiriting…" style="height:auto;padding:10px 12px;resize:vertical"></textarea>
              <button class="btn btn-primary" type="submit" id="tr-btn">${icon("languages")} Tarjima qilish</button>
            </form>
            <div id="tr-result" class="mt" aria-live="polite"></div></div>
          <div class="card"><div class="card-head"><h3>Artikllar</h3></div>
            <div class="stack small"><div><b class="art-der">der</b> — erkak jinsi (maskulin)</div><div><b class="art-die">die</b> — ayol jinsi (feminin) va ko‘plik</div><div><b class="art-das">das</b> — o‘rta jins (neytral)</div></div></div>
        </div>
      </div>`;
    icons(view);

    const $ = (sel) => view.querySelector(sel);

    function renderResults() {
      const list = state.results;
      $("#dc-count").textContent = state.q ? `“${state.q}” bo‘yicha ${list.length} ta natija` : `${list.length} ta so‘z`;
      $("#dc-offline").hidden = !state.offline;
      if (!list.length) {
        $("#dc-results").innerHTML = `<div class="card">${emptyState("search-x", "Hech narsa topilmadi", "Boshqa so‘z bilan qidiring yoki o‘ngdagi onlayn tarjimadan foydalaning.")}</div>`;
        icons($("#dc-results"));
        return;
      }
      const learned = getState().learned;
      $("#dc-results").innerHTML = list.slice(0, 200).map((w) => `<div class="dict-row ${state.open.has(w.id) ? "open" : ""}" data-row="${w.id}">
        <button class="dict-summary" aria-expanded="${state.open.has(w.id)}"><span class="de">${germanHtml(w)}</span><span class="uz">${esc(w.uzbek)}</span>
          ${learned[w.id] ? `<span class="badge green">${icon("check")}</span>` : ""}${levelBadge(w.level)}${icon("chevron-down").replace("<i", '<i class="chev"')}</button>
        <div class="dict-detail"><div class="row between"><span class="word-ipa">${esc(w.pronunciation)}</span><div class="row">${speakButton(w)}${favButton(w)}</div></div>
          <div class="mt">${exampleHtml(w)}</div>
          <div class="word-meta mt"><span class="badge">${esc(w.topic)}</span><span class="badge">${esc(w.part_of_speech)}</span></div></div></div>`).join("");
      icons($("#dc-results"));
    }

    async function runSearch() {
      const mySeq = ++seq;
      const { q, lang, level, topic } = state;
      if (!q.trim()) {
        state.results = ctx.words.filter((w) => (!level || w.level === level) && (!topic || w.topic === topic));
        state.offline = false;
        return renderResults();
      }
      try {
        const data = await api.search(q.trim().slice(0, 100), { lang, level, topic });
        if (mySeq !== seq) return;
        state.results = data.words;
        state.offline = false;
      } catch {
        if (mySeq !== seq) return;
        state.results = localSearch(ctx.words, q, { lang, level, topic });
        state.offline = true;
      }
      renderResults();
    }

    $("#dc-q").addEventListener("input", (e) => { state.q = e.target.value; clearTimeout(timer); timer = setTimeout(runSearch, 220); });
    ["lang", "level", "topic"].forEach((k) => $(`#dc-${k}`).addEventListener("change", (e) => { state[k] = e.target.value; runSearch(); }));
    $("#dc-results").addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return;
      const row = e.target.closest("[data-row]");
      if (!row || !e.target.closest(".dict-summary")) return;
      const id = Number(row.dataset.row);
      if (state.open.has(id)) state.open.delete(id); else state.open.add(id);
      row.classList.toggle("open");
      row.querySelector(".dict-summary").setAttribute("aria-expanded", String(state.open.has(id)));
    });
    bindWordActions($("#dc-results"), ctx);

    // ---- translation ----
    let dir = "de";
    view.querySelectorAll("[data-dir]").forEach((b) => b.addEventListener("click", () => {
      dir = b.dataset.dir;
      view.querySelectorAll("[data-dir]").forEach((x) => x.classList.toggle("active", x === b));
    }));
    $("#tr-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = $("#tr-text").value.trim();
      const out = $("#tr-result");
      if (!text) { out.innerHTML = `<p class="small" style="color:var(--danger)">Matn kiriting.</p>`; return; }
      $("#tr-btn").disabled = true;
      out.innerHTML = `<p class="small muted">Tarjima qilinmoqda…</p>`;
      try {
        const r = await api.translate(text, dir, dir === "de" ? "uz" : "de");
        const badge = r.source === "lingva" ? `<span class="badge green">${icon("globe")} Lingva</span>`
          : r.source === "local" ? `<span class="badge amber">${icon("database")} Lokal lug‘at</span>` : `<span class="badge red">${icon("alert-circle")} Topilmadi</span>`;
        out.innerHTML = `<div class="stack">${badge}${r.translation ? `<div class="word-uz" style="font-size:20px">${esc(r.translation)}</div>` : ""}
          ${r.word ? exampleHtml(r.word) : ""}
          ${r.message ? `<p class="small text-2">${esc(r.message)}</p>` : ""}
          ${r.suggestions && r.suggestions.length ? `<div class="small">O‘xshash so‘zlar: ${r.suggestions.map((w) => `<b>${esc(w.german)}</b> (${esc(w.uzbek)})`).join(", ")}</div>` : ""}</div>`;
      } catch (err) {
        const local = localSearch(ctx.words, text, { lang: dir }).slice(0, 3);
        out.innerHTML = `<div class="stack"><span class="badge red">${icon("wifi-off")} Xato</span><p class="small text-2">${esc(err.message)}</p>
          ${local.length ? `<div class="small">Lokal lug‘atdan: ${local.map((w) => `<b>${esc(w.german)}</b> — ${esc(w.uzbek)}`).join("; ")}</div>` : ""}</div>`;
      } finally {
        $("#tr-btn").disabled = false;
        icons(out);
      }
    });

    runSearch();
    return () => clearTimeout(timer);
  },
};
