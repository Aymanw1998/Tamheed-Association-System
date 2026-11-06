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
