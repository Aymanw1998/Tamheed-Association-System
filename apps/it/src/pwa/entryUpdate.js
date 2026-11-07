import { createAutoUpdate, RETRY_GAP_MS } from "./autoUpdate";

export const ENTRY_TIMEOUT_MS = 4000;
export const ENTRY_POLL_MS = 60000;
const PARAM = "__tamheed_release";
const KEY = "entryReleaseAttempt";
const assetPath = (value, href) => {
  try { return value ? new URL(value, href).pathname : ""; } catch { return ""; }
};
export const manifestRelease = (manifest, href) => {
  const js = assetPath(manifest?.files?.["main.js"], href);
  const css = assetPath(manifest?.files?.["main.css"], href);
  return /\/static\/js\/main\.[\w-]+\.js$/.test(js) ? `${js}|${css}` : "";
};
export function documentRelease(doc, href) {
  const js = [...doc.querySelectorAll("script[src]")].map((node) => assetPath(node.getAttribute("src"), href)).find((value) => /\/static\/js\/main\.[\w-]+\.js$/.test(value));
  const css = [...doc.querySelectorAll('link[rel="stylesheet"][href]')].map((node) => assetPath(node.getAttribute("href"), href)).find((value) => /\/static\/css\/main\.[\w-]+\.css$/.test(value));
  return js ? `${js}|${css || ""}` : "";
}

// A waiting worker must take control before reloading its cached HTML. Re-check
// local work both before activation and later before navigating this window.
export function prepareFreshWorker(container, safe, timeoutMs = ENTRY_TIMEOUT_MS) {
  if (!container?.controller) return Promise.resolve(true);
  return new Promise((resolve) => {
    const before = container.controller, watched = new Map(), requested = new Set();
    let reg, finished = false, checked = false;
    const finish = (value) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      container.removeEventListener("controllerchange", changed);
      reg?.removeEventListener("updatefound", inspect);
      watched.forEach((listener, worker) => worker.removeEventListener("statechange", listener));
      resolve(value);
    };
    const changed = () => {
      const installing = reg?.installing;
      if (checked && (!installing || installing.state === "activated") && !reg?.waiting && container.controller && container.controller !== before) finish(true);
    };
    const watch = (worker) => {
      if (!worker || watched.has(worker)) return;
      const listener = () => { if (worker.state === "redundant") finish(false); else inspect(); };
      watched.set(worker, listener); worker.addEventListener("statechange", listener);
    };
    const inspect = () => {
      if (finished || !checked) return;
      const installing = reg?.installing;
      if (installing && installing.state !== "installed" && installing.state !== "activated") { watch(installing); return; }
      const worker = installing?.state === "installed" ? installing : reg?.waiting;
      if (worker && !requested.has(worker)) {
        if (!safe()) { finish(false); return; }
        try { worker.postMessage({ type: "SKIP_WAITING" }); requested.add(worker); } catch { finish(false); }
      } else if (!worker) changed();
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    container.addEventListener("controllerchange", changed);
    Promise.resolve().then(() => container.getRegistration()).then(async (registration) => {
      if (finished) return;
      reg = registration;
      if (!reg) { finish(false); return; }
      reg.addEventListener("updatefound", inspect);
      watch(reg.installing);
      await reg.update();
      checked = true; inspect();
    }).catch(() => finish(false));
  });
}

export function startFreshApp(mount, {
  enabled = process.env.NODE_ENV === "production",
  win = window, doc = document, fetcher = (...args) => fetch(...args),
  container = navigator.serviceWorker,
  online = () => navigator.onLine !== false,
  canApply = () => true, now = () => Date.now(),
  replace = (url) => win.location.replace(url),
  base = process.env.PUBLIC_URL || "",
  store = (() => { try { return window.sessionStorage; } catch { return null; } })(),
} = {}) {
  if (!enabled) { mount(); return { ready: Promise.resolve(), stop() {} }; }
  const current = documentRelease(doc, win.location.href);
  let mounted = false, stopped = false, checking = false, preparing = false, reloading = false;
  let pending = "", nextPrepare = 0, memoryAttempt = null;
  const incoming = new URL(win.location.href).searchParams.get(PARAM);
  if (incoming) memoryAttempt = { release: incoming, at: now() };
  // This updater owns a per-release retry guard; a recent *different* build
  // must not delay adoption once the local draft has been saved.
  const guard = createAutoUpdate({ doc, getPath: () => win.location.pathname, canApply, now, store, retryGapMs: 0 });
  const safe = () => !stopped && (!mounted || guard.safeNow());
  const host = doc.getElementById("root");
  const status = doc.createElement("p");
  status.dir = "rtl"; status.textContent = "جارٍ التحقق من تحديث النظام…"; status.setAttribute("role", "status");
  if (host && !host.hasChildNodes()) host.appendChild(status);
  const recent = (release) => {
    let stored;
    try { stored = JSON.parse(store?.getItem(KEY) || "null"); } catch {}
    return [memoryAttempt, stored].some((attempt) => {
      const age = now() - Number(attempt?.at);
      return attempt?.release === release && age >= 0 && age < RETRY_GAP_MS;
    });
  };
  const apply = async () => {
    if (stopped || reloading || preparing || !pending || (mounted && doc.hidden) || !online() || !safe() || recent(pending) || now() < nextPrepare) return false;
    preparing = true; nextPrepare = now() + 10000;
    try {
      if (!await prepareFreshWorker(container, safe) || stopped || !safe()) return false;
      const url = new URL(win.location.href); url.searchParams.set(PARAM, pending);
      memoryAttempt = { release: pending, at: now() };
      try { store?.setItem(KEY, JSON.stringify(memoryAttempt)); } catch {}
      guard.markTried(); reloading = true;
      try { replace(url.href); } catch { reloading = false; }
      return reloading;
    } finally { preparing = false; }
  };
  const check = async () => {
    if (stopped || reloading || checking || (mounted && doc.hidden) || !online() || !current) return false;
    checking = true;
    const controller = new AbortController();
    let timer;
    try {
      const url = new URL(`${base || ""}/asset-manifest.json`, win.location.origin);
      url.searchParams.set("__entry_check", String(now()));
      const manifest = await Promise.race([
        Promise.resolve().then(() => fetcher(url.href, { cache: "no-store", credentials: "same-origin", signal: controller.signal }))
          .then((response) => response.ok ? response.json() : null),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("entry timeout")); }, ENTRY_TIMEOUT_MS); }),
      ]);
      const release = manifestRelease(manifest, win.location.href);
      if (stopped) return false;
      pending = release && release !== current ? release : "";
      return await apply();
    } catch { return false; }
    finally { clearTimeout(timer); checking = false; }
  };
  const resume = () => { nextPrepare = 0; check(); };
  const poll = win.setInterval(check, ENTRY_POLL_MS);
  const retry = win.setInterval(() => { if (pending) apply(); }, 1000);
  win.addEventListener("focus", resume); win.addEventListener("pageshow", resume); win.addEventListener("online", resume);
  doc.addEventListener("visibilitychange", resume);
  const stop = () => {
    stopped = true; status.remove(); guard.stop(); win.clearInterval(poll); win.clearInterval(retry);
    win.removeEventListener("focus", resume); win.removeEventListener("pageshow", resume); win.removeEventListener("online", resume);
    doc.removeEventListener("visibilitychange", resume);
  };
  const ready = check().finally(() => {
    if (stopped || reloading) return;
    // The cache-busting marker is internal; keep routes, existing queries,
    // fragments and history state intact for registration/sign-in links.
    const url = new URL(win.location.href);
    if (url.searchParams.has(PARAM)) { url.searchParams.delete(PARAM); win.history.replaceState(win.history.state, "", url.href); }
    status.remove(); mounted = true; mount();
  });
  return { ready, check, stop };
}
