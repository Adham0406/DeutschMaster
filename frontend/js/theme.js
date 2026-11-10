// Theme handling (light / dark / system).
import { getState, update } from "./storage.js";
import { icons } from "./ui.js";

const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function resolvedTheme() {
  const pref = getState().settings.theme;
  if (pref === "system") return media && media.matches ? "dark" : "light";
  return pref;
}

export function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-btn");
  if (btn) {
    btn.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
    btn.setAttribute("aria-label", theme === "dark" ? "Light rejimga o‘tish" : "Dark rejimga o‘tish");
    icons(btn);
  }
  document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
}

export function toggleTheme() {
  const next = resolvedTheme() === "dark" ? "light" : "dark";
  update((s) => { s.settings.theme = next; });
  applyTheme();
}

media?.addEventListener?.("change", () => { if (getState().settings.theme === "system") applyTheme(); });
