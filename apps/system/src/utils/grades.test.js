import { GRADES, GRADUATE, gradeLabel } from "./grades";

test("خريج comes after ثاني عشر, and a graduate shows the year (owner)", () => {
  expect(GRADES.indexOf(GRADUATE)).toBe(GRADES.indexOf("ثاني عشر") + 1);
  expect(gradeLabel({ layer: GRADUATE, graduationYear: 2027 })).toBe("خريج · 2027");
  expect(gradeLabel({ layer: GRADUATE })).toBe("خريج");
  expect(gradeLabel({ layer: "عاشر", graduationYear: 2027 })).toBe("عاشر");
  expect(gradeLabel(null)).toBe("");
});
