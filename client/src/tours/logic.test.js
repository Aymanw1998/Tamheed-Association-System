import { can, usableSteps, tourForPath, newAccess, unseenReleases, startupQueue, pickText } from "./logic";

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
