// Applies the saved theme before first paint to avoid a light/dark flash.
(function () {
  var theme = "system";
  try {
    var raw = localStorage.getItem("deutschmaster:v1");
    if (raw) theme = (JSON.parse(raw).settings || {}).theme || "system";
  } catch (e) { /* storage unavailable: fall back to system */ }
  if (theme === "system") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
