import { tourTabs, usableStepsByTab, can, usableSteps, tourForPath, newAccess, unseenReleases, startupQueue, pickText, tourPath, helpTours, helpReleases, sectionOfPath, unknownSectionKeys, isTypingTarget } from "./logic";

const T = (extra) => ({ id: "x", version: 1, route: null, detail: false, requires: null, steps: [], ...extra });
const FAKE = [
  T({ id: "students", route: /^\/students(\/|$)/, detail: false }),
  T({ id: "student-detail", route: /^\/students\/[^/]+$/, detail: true }),
];
const REL = [
  { id: "r2", date: "2026-11-01", requires: "students.view", tourId: null, title: {}, body: {} },
  { id: "r1", date: "2026-10-01", requires: null, tourId: null, title: {}, body: {} },
];

describe("can", () => {
  test("null key is allowed", () => expect(can([], null)).toBe(true));
  test("delegates to hasPermission", () => {
    expect(can(["ai.use"], "ai.use")).toBe(true);
    expect(can([], "ai.use")).toBe(false);
  });
});

describe("tourForPath", () => {
  test("detail tour is null for new", () => {
    expect(tourForPath("/students/new", [FAKE[1]])).toBeNull();
  });
  test("detail tour matches an id", () => {
    expect(tourForPath("/students/abc", [FAKE[1]]).id).toBe("student-detail");
  });
  test("anchored list and detail routes are reachable in either order", () => {
    const list = T({ id: "students", route: /^\/students\/?$/ });
    const detail = T({ id: "student", route: /^\/students\/[^/]+\/?$/, detail: true });
    [[list, detail], [detail, list]].forEach((tours) => {
      expect(tourForPath("/students", tours).id).toBe("students");
      expect(tourForPath("/students/", tours).id).toBe("students");
      expect(tourForPath("/students/abc", tours).id).toBe("student");
      expect(tourForPath("/students/new", tours)).toBeNull();
    });
  });
  test("first match wins", () => {
    expect(tourForPath("/students", FAKE).id).toBe("students");
  });
  test("no match", () => expect(tourForPath("/nowhere", FAKE)).toBeNull());
  test("tours without a route are skipped", () => {
    expect(tourForPath("/x", [T({ route: null })])).toBeNull();
  });
});

describe("newAccess", () => {
  test("first run seeds instead of prompting", () => {
    expect(newAccess(null, ["students.view"])).toEqual({ seed: true, sections: [], abilities: [] });
  });
  test("new section and new ability", () => {
    expect(newAccess(["students.view"], ["students.view", "students.delete", "vehicles.view"]))
      .toEqual({ seed: false, sections: ["vehicles"], abilities: ["students"] });
  });
  test("ignores keys the user lost", () => {
    expect(newAccess(["students.view", "vehicles.view"], ["students.view"]))
      .toEqual({ seed: false, sections: [], abilities: [] });
  });
  test("ai.use new gives nothing", () => {
    expect(newAccess(["students.view"], ["students.view", "ai.use"]))
      .toEqual({ seed: false, sections: [], abilities: [] });
  });
  test("permissions.manage is an ability of users", () => {
    expect(newAccess(["users.view"], ["users.view", "permissions.manage"]))
      .toEqual({ seed: false, sections: [], abilities: ["users"] });
  });
  test("permissions.manage without any users key gives nothing", () => {
    expect(newAccess(["students.view"], ["students.view", "permissions.manage"]))
      .toEqual({ seed: false, sections: [], abilities: [] });
  });
  test("attendance counts toward calendar", () => {
    expect(newAccess(["calendar.view"], ["calendar.view", "attendance.view"]))
      .toEqual({ seed: false, sections: [], abilities: ["calendar"] });
  });
  test("sorted and unique", () => {
    const r = newAccess([], ["vehicles.view", "vehicles.edit", "students.view"]);
    expect(r.sections).toEqual(["students", "vehicles"]);
  });
});

describe("usableSteps", () => {
  test("drops missing targets and unmet requires", () => {
    const tour = T({ steps: [
      { target: null }, { target: "a" }, { target: "gone" }, { target: "b", requires: "ai.use" },
    ] });
    const out = usableSteps(tour, { permissions: [], exists: (t) => t !== "gone" });
    expect(out.map((s) => s.target)).toEqual([null, "a"]);
  });
  test("keeps requires when permitted", () => {
    const tour = T({ steps: [{ target: "b", requires: "ai.use" }] });
    expect(usableSteps(tour, { permissions: ["ai.use"], exists: () => true })).toHaveLength(1);
  });
});

describe("unseenReleases", () => {
  test("filters by seen and permission", () => {
    expect(unseenReleases([], [], REL).map((r) => r.id)).toEqual(["r1"]);
    expect(unseenReleases(["r1"], ["students.view"], REL).map((r) => r.id)).toEqual(["r2"]);
    expect(unseenReleases(["r1", "r2"], ["students.view"], REL)).toEqual([]);
  });
});

describe("startupQueue", () => {
  const empty = { tours: {}, knownKeys: ["students.view"], seenReleases: [] };
  const perms = ["students.view", "vehicles.view"];
  test("orders welcome, access, releases", () => {
    expect(startupQueue({ state: empty, permissions: perms, deferred: new Set() }, REL))
      .toEqual(["welcome", "access", "releases"]);
  });
  test("respects deferred", () => {
    expect(startupQueue({ state: empty, permissions: perms, deferred: new Set(["welcome", "access"]) }, REL))
      .toEqual(["releases"]);
  });
  test("welcome skipped once done", () => {
    const state = { ...empty, tours: { welcome: { status: "done" } } };
    expect(startupQueue({ state, permissions: perms, deferred: new Set() }, REL)).toEqual(["access", "releases"]);
  });
  test("seed run gives only welcome", () => {
    const state = { tours: {}, knownKeys: null, seenReleases: [] };
    expect(startupQueue({ state, permissions: perms, deferred: new Set() }, REL)).toEqual(["welcome"]);
  });
});

describe("pickText", () => {
  test("picks language and falls back to ar", () => {
    const t = { ar: "أ", he: "ע", en: "e" };
    expect(pickText(t, "he")).toBe("ע");
    expect(pickText(t, "fr")).toBe("أ");
    expect(pickText(undefined, "en")).toBe("");
  });
});

describe("help center helpers", () => {
  const SEC = { students: { path: "/students", tourId: "students" }, vehicles: { path: "/vehicles", tourId: "vehicles" } };
  const TOURS3 = [
    T({ id: "welcome" }),
    T({ id: "students", route: /^\/students\/?$/ }),
    T({ id: "vehicles", route: /^\/vehicles\/?$/, requires: "vehicles.view" }),
    T({ id: "student", route: /^\/students\/[^/]+$/, detail: true }),
  ];
  test("tourPath finds the section page", () => {
    expect(tourPath("students", SEC)).toBe("/students");
    expect(tourPath("student", SEC)).toBeNull();
  });
  test("helpTours keeps permitted tours with an openable page", () => {
    const ids = (perms, canOpen) => helpTours({ permissions: perms, canOpen }, TOURS3, SEC).map((x) => x.tour.id);
    expect(ids([], () => true)).toEqual(["students"]);
    expect(ids(["vehicles.view"], () => true)).toEqual(["students", "vehicles"]);
    expect(ids(["vehicles.view"], (p) => p !== "/students")).toEqual(["vehicles"]);
  });
  test("helpReleases lists permitted ones, unseen first", () => {
    expect(helpReleases(["r1"], ["students.view"], REL).map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(helpReleases(["r2"], ["students.view"], REL).map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(helpReleases([], [], REL).map((r) => r.id)).toEqual(["r1"]);
  });
  test("sectionOfPath matches the page and pages under it", () => {
    expect(sectionOfPath("/students", SEC)).toBe("students");
    expect(sectionOfPath("/students/abc/", SEC)).toBe("students");
    expect(sectionOfPath("/studentsx", SEC)).toBeNull();
    expect(sectionOfPath("/profile", SEC)).toBeNull();
  });
  test("unknownSectionKeys lists held keys of the section not yet known", () => {
    const perms = ["users.view", "permissions.manage", "students.view"];
    expect(unknownSectionKeys("users", perms, ["users.view"])).toEqual(["permissions.manage"]);
    expect(unknownSectionKeys("users", perms, ["users.view", "permissions.manage"])).toEqual([]);
    expect(unknownSectionKeys("users", perms, null)).toEqual([]);
    expect(unknownSectionKeys(null, perms, [])).toEqual([]);
  });
});

describe("isTypingTarget", () => {
  test("text fields, selects and editable areas take typing", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTypingTarget({ tagName: "input" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "search" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
  test("buttons, boxes and nothing do not", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTypingTarget({ tagName: "INPUT", type: "submit" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "BODY" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("tabs", () => {
  const tabbed = T({ steps: [
    { target: "btn" },
    { target: "list", tab: "alerts" },
    { target: "ask", tab: "chat", requires: "ai.use" },
    { target: "talk", tab: "chat" },
  ] });
  test("lists distinct tabs in order", () => {
    expect(tourTabs(tabbed)).toEqual(["alerts", "chat"]);
    expect(tourTabs(T({ steps: [{ target: "a" }] }))).toEqual([]);
  });
  test("keeps a step only when its target was seen under its own tab", () => {
    const found = { "": new Set(["btn"]), alerts: new Set(["list"]), chat: new Set(["ask", "talk"]) };
    expect(usableStepsByTab(tabbed, { permissions: ["ai.use"], found }).map((s) => s.target)).toEqual(["btn", "list", "ask", "talk"]);
    expect(usableStepsByTab(tabbed, { permissions: [], found }).map((s) => s.target)).toEqual(["btn", "list", "talk"]);
  });
  test("chat steps drop when the chat tab never appeared (AI off)", () => {
    const found = { "": new Set(["btn"]), alerts: new Set(["list"]), chat: new Set() };
    expect(usableStepsByTab(tabbed, { permissions: ["ai.use"], found }).map((s) => s.target)).toEqual(["btn", "list"]);
  });
  test("a target seen under another tab does not count", () => {
    const found = { "": new Set(), alerts: new Set(["talk"]), chat: new Set() };
    expect(usableStepsByTab(tabbed, { permissions: [], found })).toEqual([]);
  });
});
