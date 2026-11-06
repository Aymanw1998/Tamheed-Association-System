import { initialHistory, parentDestination, recordLocation, restorePageScroll } from "./navigationHistory";
const page = (key, pathname, search = "") => ({ key, pathname, search, state: { filter: "active" } });
test("scroll restoration waits for a loading list and stops if the person interacts", () => {
  let resize;
  const handlers = new Map();
  const disconnect = jest.fn();
  const win = { innerHeight: 600, scrollTo: jest.fn(), setTimeout: jest.fn(), clearTimeout: jest.fn(),
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() { disconnect(); } },
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: (name) => handlers.delete(name),
  };
  const doc = { documentElement: { scrollHeight: 600 }, body: { scrollHeight: 600 } };
  restorePageScroll({ x: 0, y: 700 }, win, doc);
  expect(win.scrollTo).not.toHaveBeenCalled();
  doc.body.scrollHeight = 1500; resize();
  expect(win.scrollTo).toHaveBeenCalledWith(0, 700);
  expect(disconnect).toHaveBeenCalled();
  win.scrollTo.mockClear(); doc.body.scrollHeight = 600;
  restorePageScroll({ x: 0, y: 700 }, win, doc);
  handlers.get("wheel")(); doc.body.scrollHeight = 1500; resize();
  expect(win.scrollTo).not.toHaveBeenCalled();
});
test("push/back/forward retain filters; a new branch discards the abandoned forward destination", () => {
  const a = page("a", "/students", "?filter=pending");
  const b = page("b", "/students/1");
  let history = recordLocation(initialHistory(a), b, "PUSH");
  history = recordLocation(history, a, "POP");
  expect(history.index).toBe(0);
  expect(history.entries[0].search).toBe("?filter=pending");
  history = recordLocation(history, b, "POP");
  expect(history.index).toBe(1);
  history = recordLocation(history, a, "POP");
  history = recordLocation(history, page("c", "/reports"), "PUSH");
  expect(history.entries.map((entry) => entry.key)).toEqual(["a", "c"]);
});
test("replace stays in the same history slot, and an unknown pop starts a new app boundary", () => {
  let history = initialHistory(page("a", "/students"));
  history = recordLocation(history, page("b", "/students", "?tab=waiting"), "REPLACE");
  expect(history.entries).toHaveLength(1);
  history = recordLocation(history, page("unknown", "/dashboard"), "POP");
  expect(history.index).toBe(0);
  expect(history.entries).toHaveLength(1);
});
test.each([["/lessons/abc/edit", "/lessons/abc"], ["/students/new", "/students"], ["/weekly-tasks/manage", "/weekly-tasks"], ["/lessons", "/dashboard"]])("direct entry %s has an internal parent", (path, parent) => {
  expect(parentDestination(path)).toBe(parent);
});
