// Light / dark / automatic (the device's setting) theme (package C, 2026-11-08).
// The choice is kept per device in localStorage ("ui.theme"); the resolved
// theme goes on <html data-theme> for shared/tokens.css and on data-bs-theme
// for the Bootstrap parts.
export const THEME_KEY = "ui.theme";
export const THEMES = ["auto", "light", "dark"];
const listeners = new Set();
let media = null;

export function getThemePreference() {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return THEMES.includes(saved) ? saved : "auto";
  } catch { return "auto"; }
}

const systemPrefersDark = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function resolveTheme(preference = getThemePreference()) {
  if (preference === "dark" || preference === "light") return preference;
  return systemPrefersDark() ? "dark" : "light";
}

export function applyTheme(preference = getThemePreference()) {
  const theme = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.setAttribute("data-bs-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#12303c" : meta.dataset.light || meta.getAttribute("content"));
  listeners.forEach((fn) => fn(theme, preference));
  return theme;
}

export function setThemePreference(preference) {
  const next = THEMES.includes(preference) ? preference : "auto";
  try { window.localStorage.setItem(THEME_KEY, next); } catch { /* blocked storage: this visit only */ }
  return applyTheme(next);
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Once at start: apply the choice and follow the device while on "auto".
export function startTheme() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && !meta.dataset.light) meta.dataset.light = meta.getAttribute("content") || "";
  applyTheme();
  if (typeof window.matchMedia === "function" && !media) {
    media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => { if (getThemePreference() === "auto") applyTheme("auto"); };
    if (media.addEventListener) media.addEventListener("change", follow);
    else if (media.addListener) media.addListener(follow);
  }
}
