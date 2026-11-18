// Text size chosen in the profile (owner, 2026-11-17): normal, large or extra
// large, kept per device in localStorage ("ui.textSize"). The type-scale
// tokens (--fs-xs … --fs-3xl) and the root font size (for rem) are scaled on
// <html>, so the layout still reflows on a phone (CSS zoom did not).
// "normal" removes the overrides. The wall display skips it.
export const TEXT_SIZE_KEY = "ui.textSize";
export const TEXT_SIZES = [
  { id: "normal", label: "عادي", scale: 1 },
  { id: "large", label: "كبير", scale: 1.125 },
  { id: "xlarge", label: "كبير جدًا", scale: 1.25 },
];
// The sizes in shared/tokens.css, used when the page cannot read them.
export const FONT_TOKENS = { "--fs-xs": 12, "--fs-sm": 14, "--fs-base": 16, "--fs-lg": 18, "--fs-xl": 20, "--fs-2xl": 24, "--fs-3xl": 32 };
const byId = (id) => TEXT_SIZES.find((s) => s.id === id);

export function getTextSize() {
  try {
    const saved = window.localStorage.getItem(TEXT_SIZE_KEY);
    return byId(saved) ? saved : "normal";
  } catch { return "normal"; }
}

export function applyTextSize(id = getTextSize()) {
  const size = byId(id) || TEXT_SIZES[0];
  const style = document.documentElement.style;
  Object.keys(FONT_TOKENS).forEach((name) => style.removeProperty(name));
  style.removeProperty("font-size");
  if (size.scale === 1) return size.id;
  const computed = window.getComputedStyle(document.documentElement);
  Object.entries(FONT_TOKENS).forEach(([name, fallback]) => {
    const px = parseFloat(computed.getPropertyValue(name)) || fallback;
    style.setProperty(name, `${Math.round(px * size.scale * 10) / 10}px`);
  });
  style.setProperty("font-size", `${size.scale * 100}%`);
  return size.id;
}

export function setTextSize(id) {
  const next = byId(id) ? id : "normal";
  try { window.localStorage.setItem(TEXT_SIZE_KEY, next); } catch { /* blocked storage: this visit only */ }
  return applyTextSize(next);
}

// Signing out empties this device's storage, but the text size belongs to the
// device, not the user: it stays (Codex review, 2026-11-18).
// A sign-out still waiting for the server stays too (utils/pendingSignOut.js).
const DEVICE_KEYS = [TEXT_SIZE_KEY, "tamheed.system.pendingSignOut"];
export function clearStorageKeepingTextSize() {
  const kept = {};
  for (const key of DEVICE_KEYS) {
    try { kept[key] = window.localStorage.getItem(key); } catch { /* blocked storage */ }
  }
  window.localStorage.clear();
  for (const key of DEVICE_KEYS) {
    if (kept[key]) {
      try { window.localStorage.setItem(key, kept[key]); } catch { /* blocked storage */ }
    }
  }
}
