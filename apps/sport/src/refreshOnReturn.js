// An installed app stays open in the background, so data loaded once goes
// stale. Calls `refresh` when the app is shown again, gains focus, or comes
// back online; at most once per `minGapMs`. Returns a function that detaches.
export function attachRefresh(refresh, { minGapMs = 15000, now = () => Date.now() } = {}) {
  let last = -Infinity;
  const maybe = () => {
    const t = now();
    if (t - last < minGapMs) return;
    last = t;
    refresh();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") maybe();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", maybe);
  window.addEventListener("online", maybe);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", maybe);
    window.removeEventListener("online", maybe);
  };
}
