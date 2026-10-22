import { availableChapters, chapterForPath, journeyOffer, nextChapter, shouldOfferJourney } from "./journeyLogic";

const step = (target, requires) => ({ target, mood: "explain", title: "عنوان", body: "نص", ...(requires ? { requires } : {}) });

const CHAPTERS = [
  { id: "journey-intro", title: "التعارف", route: "/dashboard", requires: null, steps: [step(null), step("menu")] },
  { id: "journey-students", title: "الطلاب", route: "/students", requires: "students.view", steps: [
    step("students-add"),
    step("students-delete", "students.delete"),
  ] },
  { id: "journey-lessons", title: "الدروس", route: "/lessons", requires: "lessons.view", steps: [step("lessons-add")] },
  { id: "journey-vehicles", title: "المركبات", route: "/vehicles", requires: "vehicles.view", steps: [step("vehicles-add")] },
  { id: "journey-users", title: "المستخدمون", route: "/users", requires: "users.view", steps: [step("users-list")] },
  // Every step needs a permission the guide and the assistant lack.
  { id: "journey-audit", title: "سجل التغييرات", route: "/audit", requires: null, steps: [step("audit-table", "audit.view")] },
];

// Leaf keys of the role defaults in server/utils/permissions.js.
const ASSISTANT = [
  "dashboard.view", "calendar.view", "students.view", "lessons.view", "attendance.view",
  "reports.create", "reports.editOwn", "reports.exportPdf", "files.use", "ai.use",
];
const GUIDE = [
  "dashboard.view", "calendar.view", "students.view", "students.edit", "students.photo",
  "lessons.view", "lessons.create", "lessons.edit", "lessons.roster", "attendance.view", "attendance.record",
  "reports.create", "reports.editOwn", "reports.exportPdf", "files.use", "ai.use",
];

const ids = (list) => list.map((c) => c.id);

describe("availableChapters", () => {
  test("an assistant's permissions drop the vehicles and users chapters", () => {
    const list = ids(availableChapters(CHAPTERS, ASSISTANT));
    expect(list).not.toContain("journey-vehicles");
    expect(list).not.toContain("journey-users");
    expect(list).toEqual(["journey-intro", "journey-students", "journey-lessons"]);
  });

  test("a step requiring students.delete is dropped for a guide", () => {
    const students = availableChapters(CHAPTERS, GUIDE).find((c) => c.id === "journey-students");
    expect(students.steps.map((s) => s.target)).toEqual(["students-add"]);
    // The input is not changed.
    expect(CHAPTERS[1].steps).toHaveLength(2);
  });

  test("an emptied chapter is dropped", () => {
    expect(ids(availableChapters(CHAPTERS, GUIDE))).not.toContain("journey-audit");
    expect(ids(availableChapters(CHAPTERS, [...GUIDE, "audit.view"]))).toContain("journey-audit");
  });

  test("bad input gives an empty list", () => {
    expect(availableChapters(null, GUIDE)).toEqual([]);
    expect(availableChapters(CHAPTERS, null).map((c) => c.id)).toEqual(["journey-intro"]);
  });
});

describe("nextChapter", () => {
  const done = { status: "done", version: 1 };

  test("given done for intro and students, it returns lessons", () => {
    const tours = { "journey-intro": done, "journey-students": done };
    expect(nextChapter(CHAPTERS, tours).id).toBe("journey-lessons");
  });

  test("given all done, it returns null", () => {
    const tours = Object.fromEntries(CHAPTERS.map((c) => [c.id, done]));
    expect(nextChapter(CHAPTERS, tours)).toBeNull();
  });

  test("skipped chapters count as handled; missing state means the first chapter", () => {
    expect(nextChapter(CHAPTERS, { "journey-intro": { status: "skipped" } }).id).toBe("journey-students");
    expect(nextChapter(CHAPTERS, null).id).toBe("journey-intro");
  });
});

describe("shouldOfferJourney", () => {
  test("offers when journey-intro is missing", () => {
    expect(shouldOfferJourney({})).toBe(true);
    expect(shouldOfferJourney(null)).toBe(true);
  });

  test("does not offer once journey-intro is recorded", () => {
    expect(shouldOfferJourney({ "journey-intro": { status: "skipped" } })).toBe(false);
  });

  test("existing users who finished the old welcome tour still see it once", () => {
    expect(shouldOfferJourney({ welcome: { status: "done" } })).toBe(true);
  });
});

describe("chapterForPath", () => {
  test("/students/abc gives the students chapter", () => {
    expect(chapterForPath(CHAPTERS, "/students/abc").id).toBe("journey-students");
  });

  test("matches the route itself, with or without a trailing slash", () => {
    expect(chapterForPath(CHAPTERS, "/lessons").id).toBe("journey-lessons");
    expect(chapterForPath(CHAPTERS, "/lessons/").id).toBe("journey-lessons");
  });

  test("does not match a longer name or an unknown page", () => {
    expect(chapterForPath(CHAPTERS, "/studentsx")).toBeNull();
    expect(chapterForPath(CHAPTERS, "/nowhere")).toBeNull();
  });
});

describe("journeyOffer", () => {
  test("offers the intro first", () => {
    expect(journeyOffer(CHAPTERS, {})).toEqual({ kind: "intro" });
  });

  test("offers to resume from the first chapter left", () => {
    const offer = journeyOffer(CHAPTERS, { "journey-intro": { status: "done" } });
    expect(offer.kind).toBe("resume");
    expect(offer.chapter.id).toBe("journey-students");
  });

  test("at sign-in, a skipped intro with nothing else recorded means no offer", () => {
    const tours = { "journey-intro": { status: "skipped" } };
    expect(journeyOffer(CHAPTERS, tours, { auto: true })).toBeNull();
    expect(journeyOffer(CHAPTERS, tours).kind).toBe("resume");
  });

  test("nothing left means no offer", () => {
    const tours = Object.fromEntries(CHAPTERS.map((c) => [c.id, { status: "done" }]));
    expect(journeyOffer(CHAPTERS, tours)).toBeNull();
  });
});

test("null or broken tour state is treated as empty everywhere", () => {
  expect(journeyOffer(CHAPTERS, null)).toEqual({ kind: "intro" });
  expect(journeyOffer(CHAPTERS, null, { auto: true })).toEqual({ kind: "intro" });
  expect(journeyOffer(CHAPTERS, "bad")).toEqual({ kind: "intro" });
  expect(shouldOfferJourney(undefined)).toBe(true);
  expect(nextChapter(CHAPTERS, undefined).id).toBe("journey-intro");
});

describe("requires as an array of keys", () => {
  const chapter = {
    id: "journey-lessons", title: "الدروس", route: "/lessons", requires: null,
    steps: [step("lessons-add"), step("lesson-delete", ["lessons.edit", "lessons.delete"])],
  };

  test("the step is kept only when every key is held", () => {
    const steps = (perms) => availableChapters([chapter], perms)[0].steps.map((s) => s.target);
    expect(steps(["lessons.edit", "lessons.delete"])).toEqual(["lessons-add", "lesson-delete"]);
    expect(steps(["lessons.delete"])).toEqual(["lessons-add"]);
    expect(steps(["lessons.edit"])).toEqual(["lessons-add"]);
  });

  test("a chapter requiring several keys needs them all", () => {
    const both = { ...chapter, requires: ["lessons.view", "lessons.edit"] };
    expect(availableChapters([both], ["lessons.view"])).toEqual([]);
    expect(availableChapters([both], ["lessons.view", "lessons.edit"])).toHaveLength(1);
  });
});
