// Delegated handlers for buttons rendered by ui.wordCardHtml / favButton / speakButton.
import { learnWord, toggleFavorite } from "./gamification.js";
import { icon, icons, speak, toast } from "./ui.js";

export function bindWordActions(root, ctx, { onChange } = {}) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action][data-id]");
    if (!btn || !root.contains(btn)) return;
    const word = ctx.byId.get(Number(btn.dataset.id));
    if (!word) return;
    const action = btn.dataset.action;
    if (action === "speak") {
      e.stopPropagation();
      speak(word);
    } else if (action === "fav") {
      e.stopPropagation();
      const added = toggleFavorite(word);
      btn.classList.toggle("on", added);
      btn.setAttribute("aria-pressed", String(added));
      btn.setAttribute("aria-label", added ? "Sevimlilardan olib tashlash" : "Sevimlilarga qo‘shish");
      toast(added ? "Sevimlilarga qo‘shildi" : "Sevimlilardan olib tashlandi", word.german, "success", 1800);
      onChange?.("fav", word, added);
    } else if (action === "learn") {
      e.stopPropagation();
      if (learnWord(word)) toast("Yangi so‘z o‘rganildi", `${word.german} · +5 XP`, "xp", 1800);
      const badge = document.createElement("span");
      badge.className = "badge green grow";
      badge.innerHTML = `${icon("check")} O‘rganilgan`;
      btn.replaceWith(badge);
      icons(badge);
      badge.closest(".word-card")?.classList.add("learned");
      onChange?.("learn", word);
    }
  });
}
