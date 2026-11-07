# Source-only independent review: automatic update on entry

Codex implements; actual Claude Code reviews without editing or tools.
Review the provided source for concrete bugs, stale-shell loops, unsafe reloads,
offline/timeout failures, route/query loss, or service-worker lifecycle races.
Give severity, file/line evidence and a specific failure scenario. State when
no concrete finding is established. Do not request another reviewer.

User: each entry using an old version should update immediately.
All three CRA entry points compare current main JS/CSS with a no-store manifest
before mounting, and recheck on resume/each minute. Runtime drafts/signatures
and pending saves remain protected. Network-first navigation retains precached
offline fallback. No production deployment or data operation is included.

System entry/guard files are copied identically to Sport and IT. Navigation
helper/tests are identical in System/Sport. IT has no service worker.
Existing registration/auto-update code remains, with default cooldown retained.
Entry guard disables only generic cooldown and uses its own per-release guard.

Local verification: npm run verify passed: 1527 server, 1145 System tests,
System build. Sport: 149 tests/build passed. IT final verification in progress.
Real isolated browser with production updater/worker passed old->new on entry,
new->next after draft completion despite recent prior update, and coherent
cached next build when server/manifest respond 503. Synthetic data only.
A regression first failed for the generic cooldown delaying a distinct build;
retryGapMs=0 for the per-release entry updater fixed it and browser retest passed.

## Existing-file diff

```diff
diff --git a/apps/it/src/index.js b/apps/it/src/index.js
index 7cbccbf..7f548a5 100644
--- a/apps/it/src/index.js
+++ b/apps/it/src/index.js
@@ -2,5 +2,6 @@ import React from "react";
 import { createRoot } from "react-dom/client";
 import App from "./App.jsx";
 import "./styles.css";
+import { startFreshApp } from "./pwa/entryUpdate";

-createRoot(document.getElementById("root")).render(<App />);
+startFreshApp(() => createRoot(document.getElementById("root")).render(<App />));
diff --git a/apps/sport/src/index.js b/apps/sport/src/index.js
index 4a1eb75..c9f1859 100644
--- a/apps/sport/src/index.js
+++ b/apps/sport/src/index.js
@@ -3,7 +3,8 @@ import { createRoot } from "react-dom/client";
 import App from "./App.jsx";
 import "./styles.css";
 import { register } from "./serviceWorkerRegistration";
+import { startFreshApp } from "./pwa/entryUpdate";

-createRoot(document.getElementById("root")).render(<App />);
+startFreshApp(() => createRoot(document.getElementById("root")).render(<App />));

 register();
diff --git a/apps/sport/src/pwa/autoUpdate.js b/apps/sport/src/pwa/autoUpdate.js
index 6f95cfc..7183533 100644
--- a/apps/sport/src/pwa/autoUpdate.js
+++ b/apps/sport/src/pwa/autoUpdate.js
@@ -13,6 +13,7 @@ export function createAutoUpdate({
   canApply = () => true,
   now = () => Date.now(),
   store = sessionStore(),
+  retryGapMs = RETRY_GAP_MS,
 } = {}) {
   let edited = false, richDraft = false;
   let path = getPath(), settleUntil = 0, lastTried = -Infinity;
@@ -41,7 +42,7 @@ export function createAutoUpdate({
     try { stored = store?.getItem(LAST_KEY); } catch {}
     const previous = stored == null ? lastTried : Number(stored);
     const age = now() - previous;
-    return Number.isFinite(previous) && age >= 0 && age < RETRY_GAP_MS;
+    return Number.isFinite(previous) && age >= 0 && age < retryGapMs;
   };
   const safeNow = () => {
     notePath();
diff --git a/apps/sport/src/service-worker.js b/apps/sport/src/service-worker.js
index 3ec95e1..2071878 100644
--- a/apps/sport/src/service-worker.js
+++ b/apps/sport/src/service-worker.js
@@ -5,20 +5,23 @@ import { registerRoute, NavigationRoute } from "workbox-routing";
 import { NetworkFirst } from "workbox-strategies";
 import { ExpirationPlugin } from "workbox-expiration";
 import { shouldCache } from "./pwa/shouldCache";
+import { freshNavigation } from "./pwa/freshNavigation";

 const API_CACHE = "tamheed-sport-api";
 const ICON = "/icons/icon-192.png";

 clientsClaim();
-precacheAndRoute(self.__WB_MANIFEST);

 // SPA navigations fall back to the app shell, except API paths.
 registerRoute(
-  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
-    denylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
+  new NavigationRoute(freshNavigation((context) => createHandlerBoundToURL("/index.html")(context)), {
+    denylist: [/^\/api(\/|$)/i, /\/(?!index\.html(?:\?|$))[^/?]+\.[^/]+$/],
   })
 );

+// Navigation must precede precache's / -> /index.html matching.
+precacheAndRoute(self.__WB_MANIFEST);
+
 registerRoute(
   ({ url, request }) => url.origin === self.location.origin && shouldCache(url.href, request.method),
   new NetworkFirst({
diff --git a/apps/system/src/index.js b/apps/system/src/index.js
index fbcb9f0..c3936a8 100644
--- a/apps/system/src/index.js
+++ b/apps/system/src/index.js
@@ -5,7 +5,8 @@ import App from "./App";
 import reportWebVitals from "./reportWebVitals";
 import AppErrorBoundary from "./Components/Global/AppErrorBoundary";
 import { ConfirmProvider } from "./Components/Provides/ConfirmContext";
-import AppChrome from "./pwa/AppChrome";
+import AppChrome, { canApplySystemUpdate } from "./pwa/AppChrome";
+import { startFreshApp } from "./pwa/entryUpdate";
 import ReportProblem from "./Components/Global/ReportProblem/ReportProblem";
 import QueueStatus from "./pwa/QueueStatus";
 import { startClientIdGuard } from "./locks/clientId";
@@ -53,7 +54,7 @@ function DevToastPing() {
 }

 const root = ReactDOM.createRoot(document.getElementById("root"));
-root.render(
+startFreshApp(() => root.render(
   <ConfirmProvider>
     <ToastProvider rtl baseZIndex={999999}>
       <AppErrorBoundary>
@@ -79,7 +80,7 @@ root.render(
       <QueueStatus />
     </ToastProvider>
   </ConfirmProvider>
-);
+), { canApply: canApplySystemUpdate });

 reportWebVitals();

diff --git a/apps/system/src/pwa/autoUpdate.js b/apps/system/src/pwa/autoUpdate.js
index 6f95cfc..7183533 100644
--- a/apps/system/src/pwa/autoUpdate.js
+++ b/apps/system/src/pwa/autoUpdate.js
@@ -13,6 +13,7 @@ export function createAutoUpdate({
   canApply = () => true,
   now = () => Date.now(),
   store = sessionStore(),
+  retryGapMs = RETRY_GAP_MS,
 } = {}) {
   let edited = false, richDraft = false;
   let path = getPath(), settleUntil = 0, lastTried = -Infinity;
@@ -41,7 +42,7 @@ export function createAutoUpdate({
     try { stored = store?.getItem(LAST_KEY); } catch {}
     const previous = stored == null ? lastTried : Number(stored);
     const age = now() - previous;
-    return Number.isFinite(previous) && age >= 0 && age < RETRY_GAP_MS;
+    return Number.isFinite(previous) && age >= 0 && age < retryGapMs;
   };
   const safeNow = () => {
     notePath();
diff --git a/apps/system/src/service-worker.js b/apps/system/src/service-worker.js
index 5e0227d..b5dc221 100644
--- a/apps/system/src/service-worker.js
+++ b/apps/system/src/service-worker.js
@@ -5,20 +5,24 @@ import { registerRoute, NavigationRoute } from "workbox-routing";
 import { NetworkFirst } from "workbox-strategies";
 import { ExpirationPlugin } from "workbox-expiration";
 import { shouldCache } from "./pwa/shouldCache";
+import { freshNavigation } from "./pwa/freshNavigation";

 const API_CACHE = "tamheed-api";
 const ICON = "/icons/icon-192.png";

 clientsClaim();
-precacheAndRoute(self.__WB_MANIFEST);

 // SPA navigations fall back to the app shell, except API paths.
 registerRoute(
-  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
-    denylist: [/^\/api\//i, /\/[^/?]+\.[^/]+$/],
+  new NavigationRoute(freshNavigation((context) => createHandlerBoundToURL("/index.html")(context)), {
+    denylist: [/^\/api(\/|$)/i, /\/(?!index\.html(?:\?|$))[^/?]+\.[^/]+$/],
   })
 );

+// Register navigation first: otherwise precache's directory-index matching
+// would intercept / and /index.html before the fresh-navigation handler.
+precacheAndRoute(self.__WB_MANIFEST);
+
 registerRoute(
   ({ url, request }) =>
     url.origin === self.location.origin &&
diff --git a/server/test/compress-cache.test.js b/server/test/compress-cache.test.js
index c8fc6a6..3881c92 100644
--- a/server/test/compress-cache.test.js
+++ b/server/test/compress-cache.test.js
@@ -26,6 +26,7 @@ test("scripts and API answers are compressed; streams are not; hashed files are
   const script = "const value = 1;\n".repeat(5000);
   fs.writeFileSync(path.join(dir, "static", "js", "main.abc.js"), script);
   fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
+  fs.writeFileSync(path.join(dir, "asset-manifest.json"), '{"files":{"main.js":"/static/js/main.abc.js"}}');

   const app = express();
   app.use(compress());
@@ -51,4 +52,5 @@ test("scripts and API answers are compressed; streams are not; hashed files are
   assert.equal((await get(port, "/api/list")).headers["content-encoding"], "gzip");
   assert.equal((await get(port, "/api/live/stream")).headers["content-encoding"], undefined);
   assert.equal((await get(port, "/index.html")).headers["cache-control"], "no-cache");
+  assert.equal((await get(port, "/asset-manifest.json?__entry_check=123")).headers["cache-control"], "no-cache");
 });
diff --git a/server/utils/sportHost.js b/server/utils/sportHost.js
index 2689a20..ae8c2f5 100644
--- a/server/utils/sportHost.js
+++ b/server/utils/sportHost.js
@@ -8,7 +8,7 @@ const API_PATH_RE = /^\/api(\/|$)/;
 // deploy reaches the browser at once (without this Chrome may keep showing an
 // old build for a while). The hashed files under static/ never change, so the
 // browser keeps them for a year and does not ask again.
-const ALWAYS_CHECK = new Set(["index.html", "service-worker.js", "manifest.json"]);
+const ALWAYS_CHECK = new Set(["index.html", "service-worker.js", "manifest.json", "asset-manifest.json"]);
 const cacheHeaders = (res, file) => {
   if (ALWAYS_CHECK.has(path.basename(file))) res.set("Cache-Control", "no-cache");
   else if (file.includes(`${path.sep}static${path.sep}`)) res.set("Cache-Control", "public, max-age=31536000, immutable");
```

## apps/system/src/pwa/entryUpdate.js

```javascript
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

```

## apps/system/src/pwa/entryUpdate.test.js

```javascript
import { documentRelease, manifestRelease, prepareFreshWorker, startFreshApp, ENTRY_TIMEOUT_MS } from "./entryUpdate";
import { RETRY_GAP_MS, SETTLE_MS } from "./autoUpdate";
const manifest = (js = "old", css = "old") => ({ files: { "main.js": `/static/js/main.${js}.js`, "main.css": `/static/css/main.${css}.css` } });
const answer = (value) => ({ ok: true, json: async () => value });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
let active, hidden;
function setup({ response = manifest(), storage, container = { controller: null }, render, canApply, href = "https://example.test/students?keep=1#secret", fetcher = jest.fn().mockResolvedValue(answer(response)) } = {}) {
  const win = new EventTarget(); win.location = new URL(href);
  win.setInterval = (...args) => setInterval(...args); win.clearInterval = (timer) => clearInterval(timer);
  win.history = { state: { kept: true }, replaceState: jest.fn((state, _, url) => { win.location = new URL(url); }) };
  const values = new Map();
  const store = storage || { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const mount = jest.fn(render), replace = jest.fn();
  active = startFreshApp(mount, { enabled: true, win, doc: document, fetcher, container, store, replace, canApply, online: () => true });
  return { ...active, win, mount, replace, fetcher, values, store };
}
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(1000000);
  hidden = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  document.head.innerHTML = '<script src="/static/js/main.old.js"></script><link rel="stylesheet" href="/static/css/main.old.css">';
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  active?.stop(); active = null; jest.clearAllTimers(); jest.useRealTimers();
  if (hidden) Object.defineProperty(document, "hidden", hidden); else delete document.hidden;
});
test("a current entry verifies JS/CSS before mounting and never reloads", async () => {
  const f = setup(); expect(f.mount).not.toHaveBeenCalled();
  expect(document.querySelector('[role="status"]').textContent).toContain("التحقق");
  await f.ready;
  expect(f.mount).toHaveBeenCalledTimes(1); expect(f.replace).not.toHaveBeenCalled();
  expect(f.fetcher.mock.calls[0][0]).toContain("/asset-manifest.json?__entry_check=");
  expect(f.fetcher.mock.calls[0][1].cache).toBe("no-store");
  expect(document.querySelector('[role="status"]')).toBeNull();
});
test.each([["new", "old"], ["old", "new"]])("a changed JS or CSS build (%s / %s) updates immediately before displaying the old application", async (js, css) => {
  const f = setup({ response: manifest(js, css), canApply: () => false });
  await f.ready;
  expect(f.mount).not.toHaveBeenCalled(); expect(f.replace).toHaveBeenCalledTimes(1);
  const url = new URL(f.replace.mock.calls[0][0]);
  expect(url.pathname).toBe("/students"); expect(url.searchParams.get("keep")).toBe("1"); expect(url.hash).toBe("#secret");
  expect(url.searchParams.get("__tamheed_release")).toBe(manifestRelease(manifest(js, css), url.href));
});
test("offline/errors/malformed manifests keep the usable cached app", async () => {
  for (const fetcher of [jest.fn().mockRejectedValue(new Error("offline")), jest.fn().mockResolvedValue({ ok: false }), jest.fn().mockResolvedValue(answer({ files: { "main.js": "https://example.test/error" } }))]) {
    const f = setup({ fetcher }); await f.ready;
    expect(f.mount).toHaveBeenCalledTimes(1); expect(f.replace).not.toHaveBeenCalled(); f.stop();
  }
});
test("even a stalled manifest body has a bounded startup wait", async () => {
  const f = setup({ fetcher: jest.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }) });
  await flush(); jest.advanceTimersByTime(ENTRY_TIMEOUT_MS); await f.ready;
  expect(f.mount).toHaveBeenCalledTimes(1); expect(f.replace).not.toHaveBeenCalled();
});
test("cached old HTML cannot loop even when storage writes fail and old storage values remain", async () => {
  const release = manifestRelease(manifest("new"), "https://example.test");
  const storage = { getItem: () => JSON.stringify({ release: "other", at: Date.now() }), setItem: () => { throw new Error("blocked"); } };
  const f = setup({ response: manifest("new"), storage, href: `https://example.test/?keep=1&__tamheed_release=${encodeURIComponent(release)}#fragment` });
  await f.ready;
  expect(f.mount).toHaveBeenCalledTimes(1); expect(f.replace).not.toHaveBeenCalled();
  expect(f.win.location.search).toBe("?keep=1"); expect(f.win.location.hash).toBe("#fragment");
});
test("a different release can update on entry even immediately after another version was tried", async () => {
  const storage = { getItem: (key) => key === "autoUpdateAt" ? String(Date.now()) : JSON.stringify({ release: "previous", at: Date.now() }), setItem: () => {} };
  const f = setup({ response: manifest("new"), storage }); await f.ready;
  expect(f.replace).toHaveBeenCalledTimes(1);
});
test("a newly opened background tab checks before mounting, so first focus does not expose an old form", async () => {
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  const f = setup({ response: manifest("new") }); await f.ready;
  expect(f.replace).toHaveBeenCalledTimes(1); expect(f.mount).not.toHaveBeenCalled();
});
test("focus/resume detects a release but preserves a draft until the user leaves its page", async () => {
  const fetcher = jest.fn().mockResolvedValue(answer(manifest()));
  const f = setup({ fetcher, render: () => { document.getElementById("root").innerHTML = '<input id="draft">'; } }); await f.ready;
  f.store.setItem("autoUpdateAt", String(Date.now())); // This page just adopted the previous release.
  document.getElementById("draft").dispatchEvent(new Event("input", { bubbles: true }));
  fetcher.mockResolvedValue(answer(manifest("new")));
  f.win.dispatchEvent(new Event("pageshow")); await flush();
  expect(f.replace).not.toHaveBeenCalled();
  f.win.location = new URL("https://example.test/dashboard");
  document.getElementById("root").innerHTML = "Saved";
  jest.advanceTimersByTime(1000); await flush();
  jest.advanceTimersByTime(SETTLE_MS); await flush();
  expect(f.replace).toHaveBeenCalledTimes(1);
});
test("same-release retry cooldown is bounded and polling stops after cleanup", async () => {
  const release = manifestRelease(manifest("new"), "https://example.test");
  const f = setup({ response: manifest("new"), href: `https://example.test/?__tamheed_release=${encodeURIComponent(release)}` }); await f.ready;
  jest.advanceTimersByTime(RETRY_GAP_MS); await flush();
  expect(f.replace).toHaveBeenCalledTimes(1);
  f.stop(); const count = f.fetcher.mock.calls.length;
  f.win.dispatchEvent(new Event("focus")); jest.advanceTimersByTime(120000); await flush();
  expect(f.fetcher).toHaveBeenCalledTimes(count);
});
test("no production asset signature or development mode mounts normally", async () => {
  document.head.innerHTML = "";
  const f = setup(); await f.ready; expect(f.fetcher).not.toHaveBeenCalled(); expect(f.mount).toHaveBeenCalledTimes(1);
  const mount = jest.fn(); startFreshApp(mount, { enabled: false }); expect(mount).toHaveBeenCalledTimes(1);
  expect(documentRelease(document, "https://example.test")).toBe("");
});

function workerFixture() {
  const container = new EventTarget(); container.controller = {};
  const waiting = new EventTarget(); waiting.state = "installed"; waiting.postMessage = jest.fn();
  const reg = new EventTarget(); reg.waiting = waiting; reg.installing = null; reg.update = jest.fn().mockResolvedValue();
  container.getRegistration = jest.fn().mockResolvedValue(reg);
  return { container, waiting, reg };
}
test("an old controlling worker is activated and control changes before the entry reload", async () => {
  const { container, waiting, reg } = workerFixture();
  const f = setup({ container, response: manifest("new") }); await flush();
  expect(reg.update).toHaveBeenCalledTimes(1); expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  expect(f.replace).not.toHaveBeenCalled(); expect(f.mount).not.toHaveBeenCalled();
  reg.waiting = null; container.controller = {}; container.dispatchEvent(new Event("controllerchange")); await f.ready;
  expect(f.replace).toHaveBeenCalledTimes(1); expect(f.mount).not.toHaveBeenCalled();
});
test("a worker that fails to activate never triggers a blind reload loop", async () => {
  const { container } = workerFixture(); const f = setup({ container, response: manifest("new") });
  await flush(); jest.advanceTimersByTime(ENTRY_TIMEOUT_MS); await f.ready;
  expect(f.mount).toHaveBeenCalledTimes(1); expect(f.replace).not.toHaveBeenCalled();
});
test("newer installing worker takes precedence over an older waiting worker", async () => {
  const { container, reg, waiting } = workerFixture();
  const next = new EventTarget(); next.state = "installing"; next.postMessage = jest.fn(); reg.installing = next;
  const promise = prepareFreshWorker(container, () => true); await flush();
  expect(waiting.postMessage).not.toHaveBeenCalled();
  next.state = "installed"; next.dispatchEvent(new Event("statechange"));
  expect(next.postMessage).toHaveBeenCalledTimes(1); expect(waiting.postMessage).not.toHaveBeenCalled();
  reg.installing = null; reg.waiting = null; container.controller = {}; container.dispatchEvent(new Event("controllerchange"));
  expect(await promise).toBe(true);
});
test("typing while the worker check is pending prevents activation, and stopping prevents later actions", async () => {
  const { container, waiting, reg } = workerFixture();
  let resolve; reg.update.mockImplementation(() => new Promise((done) => { resolve = done; }));
  let safe = true; const ready = prepareFreshWorker(container, () => safe); await flush(); safe = false; resolve();
  expect(await ready).toBe(false); expect(waiting.postMessage).not.toHaveBeenCalled();
});

```

## apps/system/src/pwa/freshNavigation.js

```javascript
// Return current HTML when online, retaining the coherent precached app shell
// when offline. Never cache fresh HTML under an older worker's revision.
export function freshNavigation(fallback, { fetcher = (...args) => fetch(...args), timeoutMs = 4000 } = {}) {
  return async (context) => {
    const controller = new AbortController();
    let timer;
    try {
      const response = await Promise.race([
        fetcher(context.request, { cache: "no-store", signal: controller.signal }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("navigation timeout")); }, timeoutMs); }),
      ]);
      if (response.ok && String(response.headers.get("Content-Type") || "").includes("text/html")) return response;
    } catch {}
    finally { clearTimeout(timer); }
    return fallback(context);
  };
}

```

## apps/system/src/pwa/freshNavigation.test.js

```javascript
import { freshNavigation } from "./freshNavigation";
const response = (ok = true, type = "text/html") => ({ ok, headers: { get: () => type } });
test("online entry returns current server HTML without substituting the cached shell", async () => {
  const cached = jest.fn(), latest = response(), fetcher = jest.fn().mockResolvedValue(latest);
  const context = { request: { url: "https://example.test/" } };
  expect(await freshNavigation(cached, { fetcher })(context)).toBe(latest);
  expect(fetcher).toHaveBeenCalledWith(context.request, expect.objectContaining({ cache: "no-store" }));
  expect(cached).not.toHaveBeenCalled();
});
test.each(["offline", "server failure", "non-HTML"])("%s falls back to the coherent precached shell", async (kind) => {
  const cached = jest.fn().mockResolvedValue("cached HTML");
  const fetcher = kind === "offline" ? jest.fn().mockRejectedValue(new Error("offline")) : jest.fn().mockResolvedValue(response(kind !== "server failure", kind === "non-HTML" ? "application/json" : "text/html"));
  expect(await freshNavigation(cached, { fetcher })({ request: {} })).toBe("cached HTML");
});
test("stalled navigation falls back within a bounded wait", async () => {
  jest.useFakeTimers();
  const handler = freshNavigation(() => "cached", { fetcher: () => new Promise(() => {}), timeoutMs: 4000 });
  const result = handler({ request: {} }); jest.advanceTimersByTime(4000);
  expect(await result).toBe("cached"); jest.useRealTimers();
});

```

## apps/system/src/pwa/navigationOrder.test.js

```javascript
const mockOrder = [], mockRoutes = [];
jest.mock("workbox-core", () => ({ clientsClaim: jest.fn() }));
jest.mock("workbox-precaching", () => ({
  precacheAndRoute: () => mockOrder.push("precache"),
  createHandlerBoundToURL: () => {
    if (!mockOrder.includes("precache")) throw new Error("binding before precache initialization");
    return () => "cached shell";
  },
}));
jest.mock("workbox-routing", () => ({
  NavigationRoute: class { constructor(handler, options) { this.handler = handler; this.options = options; this.navigation = true; } },
  registerRoute: (route) => { if (route.navigation) mockOrder.push("navigation"); mockRoutes.push(route); },
}));
jest.mock("workbox-strategies", () => ({ NetworkFirst: class {} }));
jest.mock("workbox-expiration", () => ({ ExpirationPlugin: class {} }));

test("fresh navigation precedes precache for root/index entries, while API/assets stay excluded", async () => {
  const events = jest.spyOn(self, "addEventListener").mockImplementation(() => {});
  const previousFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
  try {
    require("../service-worker");
    expect(mockOrder).toEqual(["navigation", "precache"]);
    const navigation = mockRoutes[0];
    for (const url of ["/", "/index.html", "/index.html?release=new", "/students"]) {
      expect(navigation.options.denylist.some((pattern) => pattern.test(url))).toBe(false);
    }
    for (const url of ["/api", "/api/auth/me", "/static/js/main.old.js", "/file.pdf"]) {
      expect(navigation.options.denylist.some((pattern) => pattern.test(url))).toBe(true);
    }
    expect(await navigation.handler({ request: {} })).toBe("cached shell");
  } finally { events.mockRestore(); global.fetch = previousFetch; }
});

```

## apps/it/src/pwa/autoUpdate.js

```javascript
// Each page adopts a new build automatically once its local work is safe.
export const SETTLE_MS = 3000;
export const RETRY_GAP_MS = 5 * 60 * 1000;
const TICK_MS = 1000;
const LAST_KEY = "autoUpdateAt";
const FIELDS = "input:not([type=hidden]),textarea,select";
const isField = (target) => ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
const sessionStore = () => { try { return window.sessionStorage; } catch { return null; } };

export function createAutoUpdate({
  doc = document,
  getPath = () => window.location.pathname,
  canApply = () => true,
  now = () => Date.now(),
  store = sessionStore(),
  retryGapMs = RETRY_GAP_MS,
} = {}) {
  let edited = false, richDraft = false;
  let path = getPath(), settleUntil = 0, lastTried = -Infinity;
  const onEdit = (event) => {
    notePath(); // Attribute the edit to its current route before an update arrives.
    if (isField(event.target)) edited = true;
    if (event.target?.closest?.('[contenteditable]:not([contenteditable="false"])')) richDraft = true;
  };
  const onPointer = (event) => { notePath(); if (event.target?.tagName === "CANVAS") richDraft = true; };
  doc.addEventListener("input", onEdit, true);
  doc.addEventListener("change", onEdit, true);
  doc.addEventListener("pointerdown", onPointer, true);
  const stop = () => {
    doc.removeEventListener("input", onEdit, true);
    doc.removeEventListener("change", onEdit, true);
    doc.removeEventListener("pointerdown", onPointer, true);
  };
  const notePath = () => {
    const current = getPath();
    if (current === path) return;
    path = current; edited = false; richDraft = false;
    settleUntil = now() + SETTLE_MS;
  };
  const recentlyTried = () => {
    let stored;
    try { stored = store?.getItem(LAST_KEY); } catch {}
    const previous = stored == null ? lastTried : Number(stored);
    const age = now() - previous;
    return Number.isFinite(previous) && age >= 0 && age < retryGapMs;
  };
  const safeNow = () => {
    notePath();
    if (now() < settleUntil || !canApply() || recentlyTried() || richDraft) return false;
    if (doc.querySelector('[role="dialog"], [role="alertdialog"], [aria-busy="true"]')) return false;
    return !edited || !doc.querySelector(FIELDS);
  };
  const markTried = () => {
    lastTried = now();
    try { store?.setItem(LAST_KEY, String(lastTried)); } catch {}
  };
  return { safeNow, markTried, stop };
}

// A different tab may activate the worker while this page still has edits.
// Listen immediately and re-check safety at reload time, not just activation time.
export function applyWhenSafe(worker, guard = createAutoUpdate(), {
  reload = () => window.location.reload(),
  serviceWorker = navigator.serviceWorker,
  tickMs = TICK_MS,
} = {}) {
  let done = false, stopped = false, requested = false;
  let activated = worker?.state === "activated";
  let timer;
  const onController = () => { activated = true; go(); };
  const cleanup = () => { clearInterval(timer); serviceWorker?.removeEventListener?.("controllerchange", onController); };
  const go = () => {
    if (stopped || done || !guard.safeNow()) return;
    if (activated || worker?.state === "activated") {
      done = true; cleanup(); guard.markTried(); reload();
    } else if (!requested) {
      requested = true;
      try { worker.postMessage({ type: "SKIP_WAITING" }); }
      catch { requested = false; }
    }
  };
  serviceWorker?.addEventListener("controllerchange", onController);
  timer = setInterval(go, tickMs);
  go();
  return () => { stopped = true; cleanup(); };
}

```
