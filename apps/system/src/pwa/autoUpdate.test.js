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
