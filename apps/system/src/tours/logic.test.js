import { waitWhile, can, newAccess, unseenReleases, startupQueue, helpReleases, sectionOfPath, unknownSectionKeys, isTypingTarget, sectionChapter, releaseShowMe } from "./logic";

const REL = [
  { id: "r2", date: "2026-11-01", requires: "students.view", tourId: null, title: "", body: "" },
  { id: "r1", date: "2026-10-01", requires: null, tourId: null, title: "", body: "" },
];

describe("can", () => {
  test("null key is allowed", () => expect(can([], null)).toBe(true));
  test("delegates to hasPermission", () => {
    expect(can(["ai.use"], "ai.use")).toBe(true);
    expect(can([], "ai.use")).toBe(false);
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
  test("orders access, then releases (the journey offer comes before both, in TourProvider)", () => {
    expect(startupQueue({ state: empty, permissions: perms, deferred: new Set() }, REL))
      .toEqual(["access", "releases"]);
  });
  test("respects deferred", () => {
    expect(startupQueue({ state: empty, permissions: perms, deferred: new Set(["access"]) }, REL))
      .toEqual(["releases"]);
  });
  test("the old welcome tour is never queued, done or not", () => {
    const state = { ...empty, tours: { welcome: { status: "done" } } };
    expect(startupQueue({ state, permissions: perms, deferred: new Set() }, REL)).toEqual(["access", "releases"]);
    expect(startupQueue({ state: empty, permissions: perms, deferred: new Set() }, REL)).not.toContain("welcome");
  });
  test("a seed run queues nothing", () => {
    const state = { tours: {}, knownKeys: null, seenReleases: [] };
    expect(startupQueue({ state, permissions: perms, deferred: new Set() }, REL)).toEqual([]);
  });
});

describe("help center helpers", () => {
  const SEC = {
    students: { path: "/students", chapterId: "journey-students" },
    vehicles: { path: "/vehicles", chapterId: "journey-vehicles" },
  };
  test("sectionChapter gives the chapter of a section, or null", () => {
    expect(sectionChapter("students", SEC)).toBe("journey-students");
    expect(sectionChapter("nowhere", SEC)).toBeNull();
    expect(sectionChapter(null, SEC)).toBeNull();
  });
  test("releaseShowMe: the journey release starts the full journey, others one chapter", () => {
    expect(releaseShowMe({ tourId: "journey-intro" })).toEqual({ chapterId: "journey-intro", only: false });
    expect(releaseShowMe({ tourId: "journey-students" })).toEqual({ chapterId: "journey-students", only: true });
    expect(releaseShowMe({ tourId: null })).toBeNull();
    expect(releaseShowMe(null)).toBeNull();
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

describe("waitWhile", () => {
  test("resolves at once when not busy, without pausing", async () => {
    const pause = jest.fn(async () => {});
    expect(await waitWhile(() => false, { pause, cancelled: () => false })).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });
  test("pauses until no longer busy", async () => {
    let left = 3;
    const pause = jest.fn(async () => { left -= 1; });
    expect(await waitWhile(() => left > 0, { pause, cancelled: () => false })).toBe(true);
    expect(pause).toHaveBeenCalledTimes(3);
  });
  test("stops with false once cancelled", async () => {
    let calls = 0;
    const pause = async () => { calls += 1; };
    expect(await waitWhile(() => true, { pause, cancelled: () => calls >= 2 })).toBe(false);
    expect(calls).toBe(2);
  });
});
