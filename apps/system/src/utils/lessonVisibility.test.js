import { isLessonVisible } from "./lessonVisibility";

const mine = { teacher: "u1", list_students: [] };
const asStudent = { teacher: "u9", list_students: ["u1"] };
const other = { teacher: "u9", list_students: ["u8"] };

test("with the filter off everything is visible", () => {
  expect(isLessonVisible(other, { showMyLessons: false, canViewAll: false, uid: "u1" })).toBe(true);
});

test("with the filter on, only own lessons show without lessons.viewAll", () => {
  const opts = { showMyLessons: true, canViewAll: false, uid: "u1" };
  expect(isLessonVisible(mine, opts)).toBe(true);
  expect(isLessonVisible(asStudent, opts)).toBe(true);
  expect(isLessonVisible(other, opts)).toBe(false);
});

test("lessons.viewAll sees every lesson even with the filter on", () => {
  expect(isLessonVisible(other, { showMyLessons: true, canViewAll: true, uid: "u1" })).toBe(true);
});

test("read-only sport lessons are visible even in the my-lessons filter", () => {
  const sport = { readOnly: true, teacher: null };
  expect(isLessonVisible(sport, { showMyLessons: true, canViewAll: false, uid: "u1" })).toBe(true);
});
