# Actual Claude review: automatic client updates across windows

Codex implements; actual Claude Code reviews independently without edits/tools.
Review only this authorized source patch and synthetic tests. Do not inspect
files, request another reviewer or contact services. No credentials, environment,
runtime logs or user records are included.

Owner wants server releases to update clients automatically instead of requiring
the legacy update button. The current source already removed that button. This
change makes System/Sport checks run every visible minute and on focus/resume/
reconnection with updateViaCache:none. Already-installing workers are observed;
controller replacement from another tab is announced, while first install is
ignored. Registration also starts when window load already completed.

Per-tab adoption waits for its own safe moment and rechecks immediately before
reload. Removed the blind three-second reload fallback; an inactive worker must
not simply reload cached old code. Cancellation removes old listeners/timers.
Blocked session storage uses an in-memory attempt limit instead of preventing
updates forever. Input, rich-text/canvas, modal and pending-save safeguards are
retained/extended. System also holds unreported edit pages and public forms for
photo-only work, and respects its existing explicit unsaved-change state.

Real-browser synthetic testing with two local windows and an actual changing
service worker found a pre-existing route-change bug: typing after navigating
but before the update arrived was reset when safeNow first noticed the route.
A focused regression failed before the fix; edit/pointer events now note the
route before marking work dirty. The repeated browser test passed: clean page
build 2 became 3 once; dirty page stayed on 2 with its full draft and zero
reloads, then became 3 once after Finish editing changed route and settled.
The local-only worker was unregistered and both test tabs/server were closed.

Sport final full tests/build passed (128 tests, 23 suites). System verify is
in progress. No production deploy or real-client forced navigation was done.
Legacy pages already executing old manual-button JavaScript may need one initial
refresh/reopen; do not claim newly written code can execute in an old loaded page.

Please report concrete data-loss, multi-tab, lifecycle or regression findings
with file/line and failure scenario, or explicitly no findings. Review stays
pending if quota prevents an actual response.

```diff
diff --git a/apps/sport/src/pwa/autoUpdate.js b/apps/sport/src/pwa/autoUpdate.js
index 97c98e5..6f95cfc 100644
--- a/apps/sport/src/pwa/autoUpdate.js
+++ b/apps/sport/src/pwa/autoUpdate.js
@@ -1,86 +1,85 @@
-// A new version installs itself, without a button and without losing what someone
-// is typing (owner, 2026-11-05): the page reloads at a moment nothing would be lost,
-// so right away if nothing was typed, or after the person moves to another page.
-export const SETTLE_MS = 3000; // a success message on the next page stays readable
-export const RETRY_GAP_MS = 5 * 60 * 1000; // never a reload loop
+// Each page adopts a new build automatically once its local work is safe.
+export const SETTLE_MS = 3000;
+export const RETRY_GAP_MS = 5 * 60 * 1000;
 const TICK_MS = 1000;
 const LAST_KEY = "autoUpdateAt";
 const FIELDS = "input:not([type=hidden]),textarea,select";
-
 const isField = (target) => ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
+const sessionStore = () => { try { return window.sessionStorage; } catch { return null; } };

 export function createAutoUpdate({
   doc = document,
   getPath = () => window.location.pathname,
   canApply = () => true,
   now = () => Date.now(),
-  store = window.sessionStorage,
+  store = sessionStore(),
 } = {}) {
-  let edited = false;
-  let path = getPath();
-  let settleUntil = 0;
-
-  const onEdit = (event) => { if (isField(event.target)) edited = true; };
+  let edited = false, richDraft = false;
+  let path = getPath(), settleUntil = 0, lastTried = -Infinity;
+  const onEdit = (event) => {
+    notePath(); // Attribute the edit to its current route before an update arrives.
+    if (isField(event.target)) edited = true;
+    if (event.target?.closest?.('[contenteditable]:not([contenteditable="false"])')) richDraft = true;
+  };
+  const onPointer = (event) => { notePath(); if (event.target?.tagName === "CANVAS") richDraft = true; };
   doc.addEventListener("input", onEdit, true);
   doc.addEventListener("change", onEdit, true);
-
+  doc.addEventListener("pointerdown", onPointer, true);
   const stop = () => {
     doc.removeEventListener("input", onEdit, true);
     doc.removeEventListener("change", onEdit, true);
+    doc.removeEventListener("pointerdown", onPointer, true);
   };
-
-  // Moving to another page ends what was being typed.
   const notePath = () => {
     const current = getPath();
     if (current === path) return;
-    path = current;
-    edited = false;
+    path = current; edited = false; richDraft = false;
     settleUntil = now() + SETTLE_MS;
   };
-
   const recentlyTried = () => {
-    try {
-      return now() - (Number(store.getItem(LAST_KEY)) || 0) < RETRY_GAP_MS;
-    } catch {
-      return true; // no storage: no way to guard against a loop
-    }
+    let stored;
+    try { stored = store?.getItem(LAST_KEY); } catch {}
+    const previous = stored == null ? lastTried : Number(stored);
+    const age = now() - previous;
+    return Number.isFinite(previous) && age >= 0 && age < RETRY_GAP_MS;
   };
-
   const safeNow = () => {
     notePath();
-    if (now() < settleUntil || !canApply() || recentlyTried()) return false;
+    if (now() < settleUntil || !canApply() || recentlyTried() || richDraft) return false;
+    if (doc.querySelector('[role="dialog"], [role="alertdialog"], [aria-busy="true"]')) return false;
     return !edited || !doc.querySelector(FIELDS);
   };
-
   const markTried = () => {
-    try { store.setItem(LAST_KEY, String(now())); } catch { /* recentlyTried stops it */ }
+    lastTried = now();
+    try { store?.setItem(LAST_KEY, String(lastTried)); } catch {}
   };
-
   return { safeNow, markTried, stop };
 }

-// Called with the waiting worker: tells it to take over at the first safe moment.
+// A different tab may activate the worker while this page still has edits.
+// Listen immediately and re-check safety at reload time, not just activation time.
 export function applyWhenSafe(worker, guard = createAutoUpdate(), {
   reload = () => window.location.reload(),
   serviceWorker = navigator.serviceWorker,
   tickMs = TICK_MS,
 } = {}) {
-  let timer = null;
+  let done = false, stopped = false, requested = false;
+  let activated = worker?.state === "activated";
+  let timer;
+  const onController = () => { activated = true; go(); };
+  const cleanup = () => { clearInterval(timer); serviceWorker?.removeEventListener?.("controllerchange", onController); };
   const go = () => {
-    if (!guard.safeNow()) return;
-    clearInterval(timer);
-    guard.markTried();
-    let done = false;
-    const finish = () => { if (!done) { done = true; reload(); } };
-    serviceWorker?.addEventListener("controllerchange", finish);
-    try {
-      worker.postMessage({ type: "SKIP_WAITING" });
-    } catch {
-      finish();
+    if (stopped || done || !guard.safeNow()) return;
+    if (activated || worker?.state === "activated") {
+      done = true; cleanup(); guard.markTried(); reload();
+    } else if (!requested) {
+      requested = true;
+      try { worker.postMessage({ type: "SKIP_WAITING" }); }
+      catch { requested = false; }
     }
-    setTimeout(finish, 3000);
   };
+  serviceWorker?.addEventListener("controllerchange", onController);
   timer = setInterval(go, tickMs);
   go();
-  return () => clearInterval(timer);
+  return () => { stopped = true; cleanup(); };
 }
diff --git a/apps/sport/src/serviceWorkerRegistration.js b/apps/sport/src/serviceWorkerRegistration.js
index 2f25678..205793d 100644
--- a/apps/sport/src/serviceWorkerRegistration.js
+++ b/apps/sport/src/serviceWorkerRegistration.js
@@ -1,41 +1,75 @@
-// Registers the service worker in production builds only. Pages that want to
-// know about a waiting update subscribe with onUpdate(cb).
-const CHECK_EVERY_MS = 30 * 60 * 1000;
+// Update checks cover open windows and installed apps, without an update button.
+export const CHECK_EVERY_MS = 60 * 1000;
 const listeners = new Set();
-let waiting = null;
+let waiting = null, started = false;

 export function onUpdate(cb) {
   listeners.add(cb);
   if (waiting) cb(waiting);
   return () => listeners.delete(cb);
 }
-
 function announce(worker) {
   waiting = worker;
-  listeners.forEach((cb) => {
-    try { cb(worker); } catch {}
-  });
+  listeners.forEach((cb) => { try { cb(worker); } catch {} });
+}
+
+export function watchRegistration(reg, {
+  container = navigator.serviceWorker,
+  win = window,
+  doc = document,
+  online = () => navigator.onLine !== false,
+  initialController = container.controller,
+} = {}) {
+  let checking = false, previousController = initialController;
+  const watched = new Map();
+  const watchWorker = (worker) => {
+    if (!worker || watched.has(worker)) return;
+    const changed = () => { if (worker.state === "installed" && container.controller) announce(worker); };
+    watched.set(worker, changed);
+    worker.addEventListener("statechange", changed);
+    changed();
+  };
+  const found = () => watchWorker(reg.installing);
+  const controllerChanged = () => {
+    const next = container.controller;
+    // First installation claims a freshly loaded page; it needs no reload.
+    if (next && previousController && next !== previousController) announce(next);
+    previousController = next;
+  };
+  const check = async () => {
+    if (doc.hidden || !online() || checking) return;
+    checking = true;
+    try { await reg.update(); } catch {} finally { checking = false; }
+  };
+  container.addEventListener("controllerchange", controllerChanged);
+  controllerChanged();
+  reg.addEventListener("updatefound", found);
+  found(); // register() may have started installing before its promise resolved.
+  if (reg.waiting && container.controller) announce(reg.waiting);
+  const timer = win.setInterval(check, CHECK_EVERY_MS);
+  doc.addEventListener("visibilitychange", check);
+  win.addEventListener("focus", check);
+  win.addEventListener("online", check);
+  check();
+  return () => {
+    win.clearInterval(timer);
+    doc.removeEventListener("visibilitychange", check);
+    win.removeEventListener("focus", check); win.removeEventListener("online", check);
+    container.removeEventListener("controllerchange", controllerChanged);
+    reg.removeEventListener("updatefound", found);
+    watched.forEach((changed, worker) => worker.removeEventListener("statechange", changed));
+  };
 }

 export function register() {
-  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
-  window.addEventListener("load", () => {
-    navigator.serviceWorker
-      .register(`${process.env.PUBLIC_URL || ""}/service-worker.js`)
-      .then((reg) => {
-        // An open page or installed app hears of a new version without being reopened.
-        const check = () => { if (!document.hidden) reg.update().catch(() => {}); };
-        setInterval(check, CHECK_EVERY_MS);
-        document.addEventListener("visibilitychange", check);
-        if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
-        reg.addEventListener("updatefound", () => {
-          const sw = reg.installing;
-          if (!sw) return;
-          sw.addEventListener("statechange", () => {
-            if (sw.state === "installed" && navigator.serviceWorker.controller) announce(sw);
-          });
-        });
-      })
-      .catch((err) => console.error("[sw] registration failed", err));
-  });
+  if (started || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
+  started = true;
+  const start = () => {
+    const initialController = navigator.serviceWorker.controller;
+    navigator.serviceWorker.register(`${process.env.PUBLIC_URL || ""}/service-worker.js`, { updateViaCache: "none" })
+      .then((reg) => watchRegistration(reg, { initialController }))
+      .catch((error) => console.error("[sw] registration failed", error));
+  };
+  if (document.readyState === "complete") start();
+  else window.addEventListener("load", start, { once: true });
 }
diff --git a/apps/system/src/pwa/AppChrome.jsx b/apps/system/src/pwa/AppChrome.jsx
index 731bdc5..5e61dc3 100644
--- a/apps/system/src/pwa/AppChrome.jsx
+++ b/apps/system/src/pwa/AppChrome.jsx
@@ -2,11 +2,21 @@ import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
 import { onUpdate } from "../serviceWorkerRegistration";
 import { applyWhenSafe, createAutoUpdate } from "./autoUpdate";
 import { isDemo } from "../journey/demoMode";
+import { getUnsavedChanges, needsLeaveConfirm } from "../utils/unsavedChanges";
 import { canPromptInstall, openInstallGuide, subscribeInstall } from "./installState";
 import { InstallGuide } from "./InstallApp";

 const HINT_KEY = "pwa_ios_hint_dismissed";

+export function canApplySystemUpdate() {
+  const path = window.location.pathname;
+  // Photo pickers can use detached inputs. Hold unreported edit pages and
+  // public signing/registration forms even before a keyboard event is seen.
+  const publicForm = /^\/(register|register-student|parent-consent)(\/|$)/.test(path);
+  return !isDemo() && getUnsavedChanges() !== true && !needsLeaveConfirm(path) &&
+    !(publicForm && document.querySelector("input:not([type=hidden]),textarea,select,canvas"));
+}
+
 function readFlag() {
   try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; }
 }
@@ -84,7 +94,7 @@ export default function AppChrome() {

   useEffect(() => {
     // Started at once, so what is typed before an update arrives counts too.
-    const guard = createAutoUpdate({ canApply: () => !isDemo() });
+    const guard = createAutoUpdate({ canApply: canApplySystemUpdate });
     let stopApplying = null;
     const off = onUpdate((worker) => { stopApplying?.(); stopApplying = applyWhenSafe(worker, guard); });
     return () => { off(); stopApplying?.(); guard.stop(); };
diff --git a/apps/system/src/pwa/AppChrome.test.js b/apps/system/src/pwa/AppChrome.test.js
index bafe5ad..9544c2f 100644
--- a/apps/system/src/pwa/AppChrome.test.js
+++ b/apps/system/src/pwa/AppChrome.test.js
@@ -1,11 +1,25 @@
 import React, { act } from "react";
 import { createRoot } from "react-dom/client";
-import AppChrome from "./AppChrome";
+import AppChrome, { canApplySystemUpdate } from "./AppChrome";
+import { setUnsavedChanges } from "../utils/unsavedChanges";

 globalThis.IS_REACT_ACT_ENVIRONMENT = true;

 const OFFLINE = "لا يوجد اتصال – البيانات من آخر تحديث";

+test("unreported edit pages and public forms wait even for photo-only work", () => {
+  const path = window.location.pathname;
+  const form = document.createElement("input"); document.body.appendChild(form);
+  setUnsavedChanges(null);
+  for (const route of ["/students/new", "/students/one/edit", "/register-student/token", "/parent-consent"]) {
+    window.history.replaceState({}, "", route); expect(canApplySystemUpdate()).toBe(false);
+  }
+  window.history.replaceState({}, "", "/dashboard"); setUnsavedChanges(true);
+  expect(canApplySystemUpdate()).toBe(false);
+  setUnsavedChanges(false); expect(canApplySystemUpdate()).toBe(true);
+  setUnsavedChanges(null); form.remove(); window.history.replaceState({}, "", path);
+});
+
 test("offline bar follows the offline and online events", () => {
   const host = document.createElement("div");
   document.body.appendChild(host);
diff --git a/apps/system/src/pwa/autoUpdate.js b/apps/system/src/pwa/autoUpdate.js
index 97c98e5..6f95cfc 100644
--- a/apps/system/src/pwa/autoUpdate.js
+++ b/apps/system/src/pwa/autoUpdate.js
@@ -1,86 +1,85 @@
-// A new version installs itself, without a button and without losing what someone
-// is typing (owner, 2026-11-05): the page reloads at a moment nothing would be lost,
-// so right away if nothing was typed, or after the person moves to another page.
-export const SETTLE_MS = 3000; // a success message on the next page stays readable
-export const RETRY_GAP_MS = 5 * 60 * 1000; // never a reload loop
+// Each page adopts a new build automatically once its local work is safe.
+export const SETTLE_MS = 3000;
+export const RETRY_GAP_MS = 5 * 60 * 1000;
 const TICK_MS = 1000;
 const LAST_KEY = "autoUpdateAt";
 const FIELDS = "input:not([type=hidden]),textarea,select";
-
 const isField = (target) => ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
+const sessionStore = () => { try { return window.sessionStorage; } catch { return null; } };

 export function createAutoUpdate({
   doc = document,
   getPath = () => window.location.pathname,
   canApply = () => true,
   now = () => Date.now(),
-  store = window.sessionStorage,
+  store = sessionStore(),
 } = {}) {
-  let edited = false;
-  let path = getPath();
-  let settleUntil = 0;
-
-  const onEdit = (event) => { if (isField(event.target)) edited = true; };
+  let edited = false, richDraft = false;
+  let path = getPath(), settleUntil = 0, lastTried = -Infinity;
+  const onEdit = (event) => {
+    notePath(); // Attribute the edit to its current route before an update arrives.
+    if (isField(event.target)) edited = true;
+    if (event.target?.closest?.('[contenteditable]:not([contenteditable="false"])')) richDraft = true;
+  };
+  const onPointer = (event) => { notePath(); if (event.target?.tagName === "CANVAS") richDraft = true; };
   doc.addEventListener("input", onEdit, true);
   doc.addEventListener("change", onEdit, true);
-
+  doc.addEventListener("pointerdown", onPointer, true);
   const stop = () => {
     doc.removeEventListener("input", onEdit, true);
     doc.removeEventListener("change", onEdit, true);
+    doc.removeEventListener("pointerdown", onPointer, true);
   };
-
-  // Moving to another page ends what was being typed.
   const notePath = () => {
     const current = getPath();
     if (current === path) return;
-    path = current;
-    edited = false;
+    path = current; edited = false; richDraft = false;
     settleUntil = now() + SETTLE_MS;
   };
-
   const recentlyTried = () => {
-    try {
-      return now() - (Number(store.getItem(LAST_KEY)) || 0) < RETRY_GAP_MS;
-    } catch {
-      return true; // no storage: no way to guard against a loop
-    }
+    let stored;
+    try { stored = store?.getItem(LAST_KEY); } catch {}
+    const previous = stored == null ? lastTried : Number(stored);
+    const age = now() - previous;
+    return Number.isFinite(previous) && age >= 0 && age < RETRY_GAP_MS;
   };
-
   const safeNow = () => {
     notePath();
-    if (now() < settleUntil || !canApply() || recentlyTried()) return false;
+    if (now() < settleUntil || !canApply() || recentlyTried() || richDraft) return false;
+    if (doc.querySelector('[role="dialog"], [role="alertdialog"], [aria-busy="true"]')) return false;
     return !edited || !doc.querySelector(FIELDS);
   };
-
   const markTried = () => {
-    try { store.setItem(LAST_KEY, String(now())); } catch { /* recentlyTried stops it */ }
+    lastTried = now();
+    try { store?.setItem(LAST_KEY, String(lastTried)); } catch {}
   };
-
   return { safeNow, markTried, stop };
 }

-// Called with the waiting worker: tells it to take over at the first safe moment.
+// A different tab may activate the worker while this page still has edits.
+// Listen immediately and re-check safety at reload time, not just activation time.
 export function applyWhenSafe(worker, guard = createAutoUpdate(), {
   reload = () => window.location.reload(),
   serviceWorker = navigator.serviceWorker,
   tickMs = TICK_MS,
 } = {}) {
-  let timer = null;
+  let done = false, stopped = false, requested = false;
+  let activated = worker?.state === "activated";
+  let timer;
+  const onController = () => { activated = true; go(); };
+  const cleanup = () => { clearInterval(timer); serviceWorker?.removeEventListener?.("controllerchange", onController); };
   const go = () => {
-    if (!guard.safeNow()) return;
-    clearInterval(timer);
-    guard.markTried();
-    let done = false;
-    const finish = () => { if (!done) { done = true; reload(); } };
-    serviceWorker?.addEventListener("controllerchange", finish);
-    try {
-      worker.postMessage({ type: "SKIP_WAITING" });
-    } catch {
-      finish();
+    if (stopped || done || !guard.safeNow()) return;
+    if (activated || worker?.state === "activated") {
+      done = true; cleanup(); guard.markTried(); reload();
+    } else if (!requested) {
+      requested = true;
+      try { worker.postMessage({ type: "SKIP_WAITING" }); }
+      catch { requested = false; }
     }
-    setTimeout(finish, 3000);
   };
+  serviceWorker?.addEventListener("controllerchange", onController);
   timer = setInterval(go, tickMs);
   go();
-  return () => clearInterval(timer);
+  return () => { stopped = true; cleanup(); };
 }
diff --git a/apps/system/src/pwa/autoUpdate.test.js b/apps/system/src/pwa/autoUpdate.test.js
index ef51248..88be949 100644
--- a/apps/system/src/pwa/autoUpdate.test.js
+++ b/apps/system/src/pwa/autoUpdate.test.js
@@ -100,3 +100,73 @@ test("while not safe nothing is sent; once safe it is", () => {
   jest.useRealTimers();
   guard.stop();
 });
+
+test("another tab's activation waits for this tab's edits before reloading", () => {
+  jest.useFakeTimers();
+  const { guard, page } = setup(); type();
+  const worker = { state: "installed", postMessage: jest.fn() };
+  const container = new EventTarget(); const reload = jest.fn();
+  const stop = applyWhenSafe(worker, guard, { reload, serviceWorker: container });
+  container.dispatchEvent(new Event("controllerchange"));
+  jest.advanceTimersByTime(5000); expect(reload).not.toHaveBeenCalled(); expect(worker.postMessage).not.toHaveBeenCalled();
+  page.path = "/dashboard"; jest.advanceTimersByTime(1000); page.at += SETTLE_MS; jest.advanceTimersByTime(1000);
+  expect(reload).toHaveBeenCalledTimes(1);
+  stop(); guard.stop(); jest.useRealTimers();
+});
+
+test("typing after activation was requested is rechecked when the controller changes", () => {
+  jest.useFakeTimers();
+  const { guard, page } = setup(), worker = { state: "installed", postMessage: jest.fn() }, container = new EventTarget(), reload = jest.fn();
+  const stop = applyWhenSafe(worker, guard, { reload, serviceWorker: container });
+  expect(worker.postMessage).toHaveBeenCalledTimes(1); type();
+  container.dispatchEvent(new Event("controllerchange")); expect(reload).not.toHaveBeenCalled();
+  page.path = "/dashboard"; jest.advanceTimersByTime(1000); page.at += SETTLE_MS; jest.advanceTimersByTime(1000);
+  expect(reload).toHaveBeenCalledTimes(1); stop(); guard.stop(); jest.useRealTimers();
+});
+
+test("cancelling an update removes its reload callbacks and timer", () => {
+  jest.useFakeTimers();
+  const { guard } = setup(), worker = { state: "installed", postMessage: jest.fn() }, container = new EventTarget(), reload = jest.fn();
+  const stop = applyWhenSafe(worker, guard, { reload, serviceWorker: container }); stop();
+  worker.state = "activated"; container.dispatchEvent(new Event("controllerchange")); jest.advanceTimersByTime(10000);
+  expect(reload).not.toHaveBeenCalled(); guard.stop(); jest.useRealTimers();
+});
+
+test("a missing activation never blindly reloads the old cached build", () => {
+  jest.useFakeTimers();
+  const { guard } = setup(), worker = { state: "installed", postMessage: jest.fn() }, reload = jest.fn();
+  const stop = applyWhenSafe(worker, guard, { reload, serviceWorker: new EventTarget() });
+  jest.advanceTimersByTime(30000); expect(reload).not.toHaveBeenCalled(); expect(worker.postMessage).toHaveBeenCalledTimes(1);
+  stop(); guard.stop(); jest.useRealTimers();
+});
+
+test("open dialogs and a pending save hold an update even before typing", () => {
+  const { guard } = setup();
+  document.body.innerHTML = '<div role="dialog"></div>'; expect(guard.safeNow()).toBe(false);
+  document.body.innerHTML = '<button aria-busy="true">Saving</button>'; expect(guard.safeNow()).toBe(false);
+  document.body.innerHTML = '<main></main>'; expect(guard.safeNow()).toBe(true); guard.stop();
+});
+
+test.each(["canvas", "rich text"])("%s drafts are kept until the user leaves the page", (kind) => {
+  const { guard, page } = setup();
+  document.body.innerHTML = kind === "canvas" ? '<canvas id="draft"></canvas>' : '<div id="draft" contenteditable="true">Draft</div>';
+  document.getElementById("draft").dispatchEvent(new Event(kind === "canvas" ? "pointerdown" : "input", { bubbles: true }));
+  expect(guard.safeNow()).toBe(false);
+  document.body.innerHTML = '<main></main>'; expect(guard.safeNow()).toBe(false);
+  page.path = "/dashboard"; expect(guard.safeNow()).toBe(false); page.at += SETTLE_MS; expect(guard.safeNow()).toBe(true); guard.stop();
+});
+
+test("blocked session storage does not permanently disable automatic updates", () => {
+  let at = 0;
+  const guard = createAutoUpdate({ now: () => at, store: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } } });
+  document.body.innerHTML = '<main></main>';
+  expect(guard.safeNow()).toBe(true); guard.markTried(); expect(guard.safeNow()).toBe(false);
+  at += RETRY_GAP_MS; expect(guard.safeNow()).toBe(true); guard.stop();
+});
+
+test("typing after a route change before the first update stays protected after the settling delay", () => {
+  const { guard, page } = setup();
+  page.path = "/students/new"; type();
+  expect(guard.safeNow()).toBe(false); page.at += SETTLE_MS + 10000;
+  expect(guard.safeNow()).toBe(false); guard.stop();
+});
diff --git a/apps/system/src/serviceWorkerRegistration.js b/apps/system/src/serviceWorkerRegistration.js
index 2f25678..205793d 100644
--- a/apps/system/src/serviceWorkerRegistration.js
+++ b/apps/system/src/serviceWorkerRegistration.js
@@ -1,41 +1,75 @@
-// Registers the service worker in production builds only. Pages that want to
-// know about a waiting update subscribe with onUpdate(cb).
-const CHECK_EVERY_MS = 30 * 60 * 1000;
+// Update checks cover open windows and installed apps, without an update button.
+export const CHECK_EVERY_MS = 60 * 1000;
 const listeners = new Set();
-let waiting = null;
+let waiting = null, started = false;

 export function onUpdate(cb) {
   listeners.add(cb);
   if (waiting) cb(waiting);
   return () => listeners.delete(cb);
 }
-
 function announce(worker) {
   waiting = worker;
-  listeners.forEach((cb) => {
-    try { cb(worker); } catch {}
-  });
+  listeners.forEach((cb) => { try { cb(worker); } catch {} });
+}
+
+export function watchRegistration(reg, {
+  container = navigator.serviceWorker,
+  win = window,
+  doc = document,
+  online = () => navigator.onLine !== false,
+  initialController = container.controller,
+} = {}) {
+  let checking = false, previousController = initialController;
+  const watched = new Map();
+  const watchWorker = (worker) => {
+    if (!worker || watched.has(worker)) return;
+    const changed = () => { if (worker.state === "installed" && container.controller) announce(worker); };
+    watched.set(worker, changed);
+    worker.addEventListener("statechange", changed);
+    changed();
+  };
+  const found = () => watchWorker(reg.installing);
+  const controllerChanged = () => {
+    const next = container.controller;
+    // First installation claims a freshly loaded page; it needs no reload.
+    if (next && previousController && next !== previousController) announce(next);
+    previousController = next;
+  };
+  const check = async () => {
+    if (doc.hidden || !online() || checking) return;
+    checking = true;
+    try { await reg.update(); } catch {} finally { checking = false; }
+  };
+  container.addEventListener("controllerchange", controllerChanged);
+  controllerChanged();
+  reg.addEventListener("updatefound", found);
+  found(); // register() may have started installing before its promise resolved.
+  if (reg.waiting && container.controller) announce(reg.waiting);
+  const timer = win.setInterval(check, CHECK_EVERY_MS);
+  doc.addEventListener("visibilitychange", check);
+  win.addEventListener("focus", check);
+  win.addEventListener("online", check);
+  check();
+  return () => {
+    win.clearInterval(timer);
+    doc.removeEventListener("visibilitychange", check);
+    win.removeEventListener("focus", check); win.removeEventListener("online", check);
+    container.removeEventListener("controllerchange", controllerChanged);
+    reg.removeEventListener("updatefound", found);
+    watched.forEach((changed, worker) => worker.removeEventListener("statechange", changed));
+  };
 }

 export function register() {
-  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
-  window.addEventListener("load", () => {
-    navigator.serviceWorker
-      .register(`${process.env.PUBLIC_URL || ""}/service-worker.js`)
-      .then((reg) => {
-        // An open page or installed app hears of a new version without being reopened.
-        const check = () => { if (!document.hidden) reg.update().catch(() => {}); };
-        setInterval(check, CHECK_EVERY_MS);
-        document.addEventListener("visibilitychange", check);
-        if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
-        reg.addEventListener("updatefound", () => {
-          const sw = reg.installing;
-          if (!sw) return;
-          sw.addEventListener("statechange", () => {
-            if (sw.state === "installed" && navigator.serviceWorker.controller) announce(sw);
-          });
-        });
-      })
-      .catch((err) => console.error("[sw] registration failed", err));
-  });
+  if (started || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
+  started = true;
+  const start = () => {
+    const initialController = navigator.serviceWorker.controller;
+    navigator.serviceWorker.register(`${process.env.PUBLIC_URL || ""}/service-worker.js`, { updateViaCache: "none" })
+      .then((reg) => watchRegistration(reg, { initialController }))
+      .catch((error) => console.error("[sw] registration failed", error));
+  };
+  if (document.readyState === "complete") start();
+  else window.addEventListener("load", start, { once: true });
 }
```

## apps/system/src/serviceWorkerRegistration.test.js

```js
let stop, off, hidden;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function worker(state = "installing") { const value = new EventTarget(); value.state = state; return value; }
function setup({ controller = worker("activated"), installing = null, waiting = null, before } = {}) {
  const source = require("./serviceWorkerRegistration");
  const container = new EventTarget(); container.controller = controller;
  const reg = new EventTarget(); reg.installing = installing; reg.waiting = waiting; reg.update = jest.fn().mockResolvedValue(undefined);
  const status = { online: true };
  if (before) before(container, reg);
  const callback = jest.fn(); off = source.onUpdate(callback);
  stop = source.watchRegistration(reg, { container, online: () => status.online });
  return { ...source, container, reg, callback, status };
}
beforeEach(() => {
  jest.resetModules(); jest.useFakeTimers(); hidden = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => {
  stop?.(); off?.(); stop = null; off = null; jest.clearAllTimers(); jest.useRealTimers();
  if (hidden) Object.defineProperty(document, "hidden", hidden); else delete document.hidden;
});

test("visible pages check each minute and immediately on focus, resume and reconnection", async () => {
  const { reg, CHECK_EVERY_MS, status } = setup(); await flush(); expect(reg.update).toHaveBeenCalledTimes(1);
  expect(CHECK_EVERY_MS).toBe(60000);
  jest.advanceTimersByTime(CHECK_EVERY_MS); await flush(); expect(reg.update).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  jest.advanceTimersByTime(120000); await flush(); expect(reg.update).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  document.dispatchEvent(new Event("visibilitychange")); await flush(); expect(reg.update).toHaveBeenCalledTimes(3);
  window.dispatchEvent(new Event("focus")); await flush(); expect(reg.update).toHaveBeenCalledTimes(4);
  status.online = false; window.dispatchEvent(new Event("online")); await flush(); expect(reg.update).toHaveBeenCalledTimes(4);
  status.online = true; window.dispatchEvent(new Event("online")); await flush(); expect(reg.update).toHaveBeenCalledTimes(5);
});

test("a worker that was already installing before registration resolved is still observed", () => {
  const installing = worker(); const { reg, callback } = setup({ installing });
  reg.dispatchEvent(new Event("updatefound")); installing.state = "installed"; installing.dispatchEvent(new Event("statechange"));
  expect(callback).toHaveBeenCalledTimes(1); expect(callback).toHaveBeenCalledWith(installing);
});

test("an already waiting worker is announced", () => {
  const waiting = worker("installed"), { callback } = setup({ waiting }); expect(callback).toHaveBeenCalledWith(waiting);
});

test("another window activating a worker notifies this window even without updatefound", () => {
  const { container, callback } = setup(); const next = worker("activated"); container.controller = next;
  container.dispatchEvent(new Event("controllerchange")); expect(callback).toHaveBeenCalledWith(next);
});

test("the first installation claims the current page without triggering a reload request", () => {
  const { container, callback } = setup({ controller: null }); container.controller = worker("activated");
  container.dispatchEvent(new Event("controllerchange")); expect(callback).not.toHaveBeenCalled();
});

test("overlapping resume checks share one in-flight check, and failures can be retried", async () => {
  const { reg } = setup(); await flush();
  let release; reg.update.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("online"));
  expect(reg.update).toHaveBeenCalledTimes(2); release(); await flush();
  reg.update.mockRejectedValueOnce(new Error("offline")); window.dispatchEvent(new Event("focus")); await flush();
  window.dispatchEvent(new Event("focus")); await flush(); expect(reg.update).toHaveBeenCalledTimes(4);
});

test("cleanup stops polling and all update/controller listeners", async () => {
  const installing = worker(), { reg, callback, container } = setup({ installing }); await flush(); stop();
  installing.state = "installed"; installing.dispatchEvent(new Event("statechange"));
  container.controller = worker("activated"); container.dispatchEvent(new Event("controllerchange"));
  window.dispatchEvent(new Event("focus")); jest.advanceTimersByTime(120000); await flush();
  expect(callback).not.toHaveBeenCalled(); expect(reg.update).toHaveBeenCalledTimes(1);
});

test("activation that occurred before registration resolved is not missed", () => {
  const source = require("./serviceWorkerRegistration"), container = new EventTarget(), previous = worker("activated"), current = worker("activated");
  container.controller = current;
  const reg = new EventTarget(); reg.update = jest.fn().mockResolvedValue(undefined);
  const callback = jest.fn(); off = source.onUpdate(callback);
  stop = source.watchRegistration(reg, { container, initialController: previous });
  expect(callback).toHaveBeenCalledWith(current);
});

```

## apps/sport/src/pwa/autoUpdate.test.js

```js
import { applyWhenSafe, createAutoUpdate, RETRY_GAP_MS, SETTLE_MS } from "./autoUpdate";

function setup({ canApply = () => true } = {}) {
  const page = { path: "/register", at: 1000000 };
  const values = new Map();
  const store = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  document.body.innerHTML = '<input id="field" /><button id="plain"></button>';
  const guard = createAutoUpdate({ getPath: () => page.path, now: () => page.at, store, canApply });
  return { page, guard };
}
const type = () => document.getElementById("field").dispatchEvent(new Event("input", { bubbles: true }));

test("with nothing typed the update goes at once", () => {
  const { guard } = setup();
  expect(guard.safeNow()).toBe(true);
  guard.stop();
});

test("while someone has typed on this page it waits", () => {
  const { guard, page } = setup();
  type();
  expect(guard.safeNow()).toBe(false);
  page.at += 60 * 60 * 1000;
  expect(guard.safeNow()).toBe(false);
  guard.stop();
});

test("after moving to another page it waits for the message there to be read, then goes", () => {
  const { guard, page } = setup();
  type();
  page.path = "/login";
  expect(guard.safeNow()).toBe(false);
  page.at += SETTLE_MS;
  expect(guard.safeNow()).toBe(true);
  guard.stop();
});

test("typing on the new page holds it again", () => {
  const { guard, page } = setup();
  page.path = "/login";
  page.at += SETTLE_MS;
  type();
  expect(guard.safeNow()).toBe(false);
  guard.stop();
});

test("a sign-in is over once no field is left on the page, even with no address change", () => {
  const { guard } = setup();
  type();
  document.body.innerHTML = "<main></main>";
  expect(guard.safeNow()).toBe(true);
  guard.stop();
});

test("training mode holds it", () => {
  const { guard } = setup({ canApply: () => false });
  expect(guard.safeNow()).toBe(false);
  guard.stop();
});

test("it never loops: after one try, nothing for a while", () => {
  const { guard, page } = setup();
  guard.markTried();
  expect(guard.safeNow()).toBe(false);
  page.at += RETRY_GAP_MS;
  expect(guard.safeNow()).toBe(true);
  guard.stop();
});

test("when safe it tells the worker and reloads once it took over", () => {
  jest.useFakeTimers();
  const { guard } = setup();
  const worker = { postMessage: jest.fn() };
  const listeners = {};
  const serviceWorker = { addEventListener: (name, fn) => { listeners[name] = fn; } };
  const reload = jest.fn();
  applyWhenSafe(worker, guard, { reload, serviceWorker });
  expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  listeners.controllerchange();
  jest.advanceTimersByTime(5000);
  expect(reload).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
  guard.stop();
});

test("while not safe nothing is sent; once safe it is", () => {
  jest.useFakeTimers();
  const { guard, page } = setup();
  type();
  const worker = { postMessage: jest.fn() };
  applyWhenSafe(worker, guard, { reload: () => {}, serviceWorker: { addEventListener() {} } });
  jest.advanceTimersByTime(5000);
  expect(worker.postMessage).not.toHaveBeenCalled();
  page.path = "/login";
  jest.advanceTimersByTime(1000);
  expect(worker.postMessage).not.toHaveBeenCalled();
  page.at += SETTLE_MS;
  jest.advanceTimersByTime(1000);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
  guard.stop();
});

test("another tab's activation waits for this tab's edits before reloading", () => {
  jest.useFakeTimers();
  const { guard, page } = setup(); type();
  const worker = { state: "installed", postMessage: jest.fn() };
  const container = new EventTarget(); const reload = jest.fn();
  const stop = applyWhenSafe(worker, guard, { reload, serviceWorker: container });
  container.dispatchEvent(new Event("controllerchange"));
  jest.advanceTimersByTime(5000); expect(reload).not.toHaveBeenCalled(); expect(worker.postMessage).not.toHaveBeenCalled();
  page.path = "/dashboard"; jest.advanceTimersByTime(1000); page.at += SETTLE_MS; jest.advanceTimersByTime(1000);
  expect(reload).toHaveBeenCalledTimes(1);
  stop(); guard.stop(); jest.useRealTimers();
});

test("typing after activation was requested is rechecked when the controller changes", () => {
  jest.useFakeTimers();
  const { guard, page } = setup(), worker = { state: "installed", postMessage: jest.fn() }, container = new EventTarget(), reload = jest.fn();
  const stop = applyWhenSafe(worker, guard, { reload, serviceWorker: container });
  expect(worker.postMessage).toHaveBeenCalledTimes(1); type();
  container.dispatchEvent(new Event("controllerchange")); expect(reload).not.toHaveBeenCalled();
  page.path = "/dashboard"; jest.advanceTimersByTime(1000); page.at += SETTLE_MS; jest.advanceTimersByTime(1000);
  expect(reload).toHaveBeenCalledTimes(1); stop(); guard.stop(); jest.useRealTimers();
});

test("cancelling an update removes its reload callbacks and timer", () => {
  jest.useFakeTimers();
  const { guard } = setup(), worker = { state: "installed", postMessage: jest.fn() }, container = new EventTarget(), reload = jest.fn();
  const stop = applyWhenSafe(worker, guard, { reload, serviceWorker: container }); stop();
  worker.state = "activated"; container.dispatchEvent(new Event("controllerchange")); jest.advanceTimersByTime(10000);
  expect(reload).not.toHaveBeenCalled(); guard.stop(); jest.useRealTimers();
});

test("a missing activation never blindly reloads the old cached build", () => {
  jest.useFakeTimers();
  const { guard } = setup(), worker = { state: "installed", postMessage: jest.fn() }, reload = jest.fn();
  const stop = applyWhenSafe(worker, guard, { reload, serviceWorker: new EventTarget() });
  jest.advanceTimersByTime(30000); expect(reload).not.toHaveBeenCalled(); expect(worker.postMessage).toHaveBeenCalledTimes(1);
  stop(); guard.stop(); jest.useRealTimers();
});

test("open dialogs and a pending save hold an update even before typing", () => {
  const { guard } = setup();
  document.body.innerHTML = '<div role="dialog"></div>'; expect(guard.safeNow()).toBe(false);
  document.body.innerHTML = '<button aria-busy="true">Saving</button>'; expect(guard.safeNow()).toBe(false);
  document.body.innerHTML = '<main></main>'; expect(guard.safeNow()).toBe(true); guard.stop();
});

test.each(["canvas", "rich text"])("%s drafts are kept until the user leaves the page", (kind) => {
  const { guard, page } = setup();
  document.body.innerHTML = kind === "canvas" ? '<canvas id="draft"></canvas>' : '<div id="draft" contenteditable="true">Draft</div>';
  document.getElementById("draft").dispatchEvent(new Event(kind === "canvas" ? "pointerdown" : "input", { bubbles: true }));
  expect(guard.safeNow()).toBe(false);
  document.body.innerHTML = '<main></main>'; expect(guard.safeNow()).toBe(false);
  page.path = "/dashboard"; expect(guard.safeNow()).toBe(false); page.at += SETTLE_MS; expect(guard.safeNow()).toBe(true); guard.stop();
});

test("blocked session storage does not permanently disable automatic updates", () => {
  let at = 0;
  const guard = createAutoUpdate({ now: () => at, store: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } } });
  document.body.innerHTML = '<main></main>';
  expect(guard.safeNow()).toBe(true); guard.markTried(); expect(guard.safeNow()).toBe(false);
  at += RETRY_GAP_MS; expect(guard.safeNow()).toBe(true); guard.stop();
});

test("typing after a route change before the first update stays protected after the settling delay", () => {
  const { guard, page } = setup();
  page.path = "/students/new"; type();
  expect(guard.safeNow()).toBe(false); page.at += SETTLE_MS + 10000;
  expect(guard.safeNow()).toBe(false); guard.stop();
});

```

Final verification addendum: npm run verify passed (1,497 server, 1,114 System
in 126 suites, optimized build). Final Sport passed 128 tests in 23 suites and
optimized build. This result was recorded after the quota response, and is not
represented as independent peer approval.
