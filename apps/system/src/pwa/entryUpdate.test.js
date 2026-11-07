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
