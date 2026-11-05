import { reloadOnceForNewBuild } from "./lazyPage";

const memory = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test("a failed page reloads once per build, however far apart the failures are", () => {
  const store = memory();
  const reload = jest.fn();
  expect(reloadOnceForNewBuild(store, reload, "main.a.js")).toBe(true);
  expect(reloadOnceForNewBuild(store, reload, "main.a.js")).toBe(false);
  expect(reloadOnceForNewBuild(store, reload, "main.a.js")).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
});

test("a later deploy may reload again", () => {
  const store = memory();
  const reload = jest.fn();
  reloadOnceForNewBuild(store, reload, "main.a.js");
  expect(reloadOnceForNewBuild(store, reload, "main.b.js")).toBe(true);
  expect(reload).toHaveBeenCalledTimes(2);
});

test("with no storage it never reloads", () => {
  const reload = jest.fn();
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => {} };
  expect(reloadOnceForNewBuild(broken, reload, "main.a.js")).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});
