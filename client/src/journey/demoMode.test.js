import { closeOnDemoToggle, demoEpoch, getDemoStore, isDemo, startDemo, stopDemo, subscribeDemo } from "./demoMode";

afterEach(() => {
  stopDemo();
  jest.restoreAllMocks();
});

test("start then stop toggles isDemo and bumps demoEpoch each time", () => {
  expect(isDemo()).toBe(false);
  expect(getDemoStore()).toBeNull();
  const before = demoEpoch();

  startDemo();
  expect(isDemo()).toBe(true);
  expect(getDemoStore()).not.toBeNull();
  expect(demoEpoch()).toBe(before + 1);

  stopDemo();
  expect(isDemo()).toBe(false);
  expect(getDemoStore()).toBeNull();
  expect(demoEpoch()).toBe(before + 2);
});

test("each start gives a fresh store", () => {
  startDemo();
  const first = getDemoStore();
  first.students.push({ _id: "x" });
  stopDemo();
  startDemo();
  expect(getDemoStore()).not.toBe(first);
  expect(getDemoStore().students.some((s) => s._id === "x")).toBe(false);
});

test("subscribeDemo is notified on start and stop, and can unsubscribe", () => {
  const seen = [];
  const unsubscribe = subscribeDemo((on) => seen.push(on));
  startDemo();
  stopDemo();
  unsubscribe();
  startDemo();
  expect(seen).toEqual([true, false]);
});

test("demo flag is memory-only", () => {
  const local = jest.spyOn(Storage.prototype, "setItem");
  startDemo();
  stopDemo();
  expect(local).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test("closeOnDemoToggle runs the close function once, on the next start or stop", () => {
  const close = jest.fn();
  closeOnDemoToggle(close);
  startDemo();
  stopDemo();
  expect(close).toHaveBeenCalledTimes(1);
});

test("the returned cancel stops it from running", () => {
  const close = jest.fn();
  const cancel = closeOnDemoToggle(close);
  cancel();
  startDemo();
  expect(close).not.toHaveBeenCalled();
});
