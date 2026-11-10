// Settings: theme, volume, speech rate, daily goal, export/import, reset.
import { exportData, getState, isPersistent, parseImport, replaceState, resetAll, update } from "./storage.js";
import { confirmModal, esc, icon, icons, modal, speak, speechSupported, toast } from "./ui.js";
import { applyTheme } from "./theme.js";

export default {
  title: "Sozlamalar",
  subtitle: "Ko‘rinish, ovoz, maqsad va ma’lumotlar",
  render(view) {
    function render() {
      const st = getState().settings;
      view.innerHTML = `<div class="page-head"><div><h2>Sozlamalar</h2><p>O‘zgarishlar darhol saqlanadi</p></div></div>
        ${isPersistent() ? "" : `<div class="card" style="margin-bottom:16px;border-color:var(--warning)"><b>${icon("alert-triangle")} localStorage mavjud emas.</b>
          <p class="small text-2">Brauzer ma’lumot saqlashni blokladi (masalan, maxfiy rejim). Progress sahifa yopilganda yo‘qoladi.</p></div>`}
        <div class="grid grid-2">
          <div class="card"><div class="card-head"><h3>Ko‘rinish va ovoz</h3></div>
            <div class="setting"><div><h4>Mavzu</h4><p>Dark yoki Light rejim</p></div><div class="control">
              <div class="segmented" role="group" aria-label="Mavzu">${[["light", "Light"], ["dark", "Dark"], ["system", "Tizim"]].map(([v, l]) =>
                `<button data-theme-opt="${v}" class="${st.theme === v ? "active" : ""}">${l}</button>`).join("")}</div></div></div>
            <div class="setting"><div><h4>Ovoz balandligi</h4><p>Talaffuz audiosi: <b id="vol-val">${Math.round(st.volume * 100)}%</b></p></div>
              <div class="control" style="min-width:200px"><input type="range" id="set-volume" min="0" max="1" step="0.05" value="${st.volume}" aria-label="Ovoz balandligi"></div></div>
            <div class="setting"><div><h4>Talaffuz tezligi</h4><p><b id="rate-val">${st.rate.toFixed(2)}×</b></p></div>
              <div class="control" style="min-width:200px"><input type="range" id="set-rate" min="0.5" max="1.5" step="0.05" value="${st.rate}" aria-label="Talaffuz tezligi"></div></div>
            <div class="setting"><div><h4>Ovozni sinash</h4><p>${speechSupported() ? "Web Speech API (de-DE)" : "Brauzeringiz nutq sintezini qo‘llab-quvvatlamaydi"}</p></div>
              <div class="control"><button class="btn" id="set-test" ${speechSupported() ? "" : "disabled"}>${icon("volume-2")} Guten Tag!</button></div></div>
          </div>
          <div class="card"><div class="card-head"><h3>O‘qish</h3></div>
            <div class="setting"><div><h4>Kunlik maqsad</h4><p>Har kuni o‘rganiladigan so‘zlar soni (1–200)</p></div>
              <div class="control"><form id="goal-form" class="row"><input class="input" type="number" id="set-goal" min="1" max="200" value="${st.dailyGoal}" style="width:100px" aria-label="Kunlik maqsad"><button class="btn" type="submit">Saqlash</button></form></div></div>
            <div class="setting"><div><h4>Progressni eksport qilish</h4><p>Barcha ma’lumotlar JSON faylga yuklanadi</p></div>
              <div class="control"><button class="btn" id="set-export">${icon("download")} Eksport</button></div></div>
            <div class="setting"><div><h4>Progressni import qilish</h4><p>Avval eksport qilingan JSON faylni tanlang</p></div>
              <div class="control"><label class="btn" for="set-import">${icon("upload")} Import</label><input type="file" id="set-import" accept="application/json,.json" hidden></div></div>
            <div class="setting"><div><h4>Ma’lumotlarni tozalash</h4><p>Barcha progress, XP va sozlamalar o‘chiriladi</p></div>
              <div class="control"><button class="btn btn-danger" id="set-reset">${icon("trash-2")} Tozalash</button></div></div>
          </div>
        </div>`;
      icons(view);
      bind();
    }

    function bind() {
      view.querySelectorAll("[data-theme-opt]").forEach((b) => b.addEventListener("click", () => {
        update((s) => { s.settings.theme = b.dataset.themeOpt; });
        applyTheme();
        render();
      }));
      const vol = view.querySelector("#set-volume");
      vol.addEventListener("input", () => { view.querySelector("#vol-val").textContent = `${Math.round(vol.value * 100)}%`; });
      vol.addEventListener("change", () => { update((s) => { s.settings.volume = Number(vol.value); }); });
      const rate = view.querySelector("#set-rate");
      rate.addEventListener("input", () => { view.querySelector("#rate-val").textContent = `${Number(rate.value).toFixed(2)}×`; });
      rate.addEventListener("change", () => { update((s) => { s.settings.rate = Number(rate.value); }); });
      view.querySelector("#set-test").addEventListener("click", () => speak("Guten Tag! Willkommen bei DeutschMaster."));
      view.querySelector("#goal-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const n = Number(view.querySelector("#set-goal").value);
        if (!Number.isInteger(n) || n < 1 || n > 200) return toast("Noto‘g‘ri qiymat", "1 dan 200 gacha butun son kiriting.", "error");
        update((s) => { s.settings.dailyGoal = n; });
        toast("Kunlik maqsad saqlandi", `${n} ta so‘z`, "success");
      });
      view.querySelector("#set-export").addEventListener("click", () => {
        const blob = new Blob([exportData()], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `deutschmaster-progress-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("Eksport tayyor", a.download, "success");
      });
      view.querySelector("#set-import").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return toast("Fayl juda katta", "Maksimal hajm 2 MB.", "error");
        const result = parseImport(await file.text());
        if (!result.data) {
          return modal({ title: "Import qilib bo‘lmadi", body: `<ul>${result.errors.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` });
        }
        const learned = Object.keys(result.data.learned).length;
        const warn = result.errors.length ? `<p class="small" style="color:var(--warning)">${result.errors.length} ta noto‘g‘ri yozuv tashlab yuboriladi.</p>` : "";
        const ok = await confirmModal("Progressni import qilish",
          `<p>Faylda <b>${learned}</b> ta o‘rganilgan so‘z va <b>${result.data.xp}</b> XP bor. Joriy progress shu ma’lumotlar bilan almashtiriladi.</p>${warn}`, "Import qilish");
        if (!ok) return;
        replaceState(result.data);
        applyTheme();
        toast("Import muvaffaqiyatli", `${learned} ta so‘z tiklandi`, "success");
        render();
      });
      view.querySelector("#set-reset").addEventListener("click", async () => {
        const ok = await confirmModal("Barcha ma’lumotlarni o‘chirish?",
          "<p>O‘rganilgan so‘zlar, XP, yutuqlar, statistika va takrorlash jadvali butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi. Avval eksport qilib qo‘yishingiz mumkin.</p>",
          "Ha, o‘chirish", true);
        if (!ok) return;
        resetAll();
        toast("Ma’lumotlar tozalandi", "", "success");
        render();
      });
    }

    render();
  },
};
