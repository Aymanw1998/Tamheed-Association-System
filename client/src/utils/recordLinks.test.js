import { byLessonTime, guideLessons, guideStudents, lessonWhen, guideLink } from "./recordLinks";

const oid = (s) => ({ toString: () => s }); // an ObjectId-like id
const L = (id, day, startMin, extra = {}) => ({ _id: id, name: id, date: { day, startMin }, list_students: [], ...extra });

describe("byLessonTime", () => {
  it("sorts lessons by day then start", () => {
    const lessons = [L("c", 3, 600), L("a", 1, 960), L("b", 1, 600)];
    expect([...lessons].sort(byLessonTime).map((l) => l._id)).toEqual(["b", "a", "c"]);
  });
});

describe("guideLessons", () => {
  it("returns lessons the user teaches or helps in, sorted", () => {
    const lessons = [L("b", 2, 0, { teacher: "u1" }), L("a", 1, 0, { helper: oid("u1") }), L("c", 1, 0, { teacher: "u2" })];
    expect(guideLessons(lessons, "u1").map((l) => l._id)).toEqual(["a", "b"]);
  });
});

describe("guideStudents", () => {
  it("returns the students the user is responsible for, sorted by name", () => {
    const students = [
      { _id: "1", firstname: "ب", lastname: "ا", main_teacher: "u1" },
      { _id: "2", firstname: "ا", lastname: "ب", main_teacher: oid("u1") },
      { _id: "3", firstname: "ا", lastname: "ا", main_teacher: "u2" },
    ];
    expect(guideStudents(students, "u1").map((s) => s._id)).toEqual(["2", "1"]);
  });
});

describe("lessonWhen", () => {
  it("gives the day name and the start time", () => {
    expect(lessonWhen({ date: { day: 1, startMin: 960 } })).toBe("الأحد 16:00");
    expect(lessonWhen({ date: { day: 7, startMin: 545 } })).toBe("السبت 09:05");
  });
});

describe("guideLink", () => {
  it("links the viewer's own guide entry to the profile", () => {
    expect(guideLink({ name: "x", phone: "1" }, "u1", "u1")).toBe("/profile");
  });
  it("links to the guide's page when the contact carries a tz", () => {
    expect(guideLink({ name: "x", phone: "1", tz: "900000002" }, "u9", "u1")).toBe("/users/900000002");
  });
  it("gives no link without a tz or without a contact", () => {
    expect(guideLink({ name: "x", phone: "1" }, "u9", "u1")).toBeNull();
    expect(guideLink(null, "u9", "u1")).toBeNull();
  });
});

describe("lessons stored with date.hh (no startMin)", () => {
  it("shows and sorts them by that hour, like the schedule", () => {
    expect(lessonWhen({ date: { day: 1, hh: 16 } })).toBe("الأحد 16:00");
    const lessons = [L("late", 1, undefined, { date: { day: 1, hh: 16 }, list_students: ["s1"] }), L("early", 1, 540, { list_students: ["s1"] })];
    expect([...lessons].sort(byLessonTime).map((l) => l._id)).toEqual(["early", "late"]);
  });
});
