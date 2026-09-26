import { healthNote, joinParts, personInitial, studentSummary, userSummary } from "./personCard";

const NOW = new Date("2026-09-26T12:00:00");

test("the initial is the first letter of the first name", () => {
  expect(personInitial({ firstname: " آدم", lastname: "أبو صويص" })).toBe("آ");
});

test("a student without a first name falls back to the last name, then a placeholder", () => {
  expect(personInitial({ firstname: "", lastname: "حسونة" })).toBe("ح");
  expect(personInitial({})).toBe("؟");
});

test("the summary joins grade, age, and father name", () => {
  const student = { layer: "الصف الرابع", birth_date: "2016-03-01", father_name: "محمود أبو صويص" };
  expect(studentSummary(student, NOW)).toBe("الصف الرابع · العمر 10 · محمود أبو صويص");
});

test("missing or invalid parts are skipped in the summary", () => {
  expect(studentSummary({ layer: "", birth_date: "not a date", father_name: "خالد" }, NOW)).toBe("خالد");
  expect(studentSummary({}, NOW)).toBe("");
});

test.each([
  ["ربو خفيف", "ربو خفيف"],
  ["  حساسية من الحليب ", "حساسية من الحليب"],
  ["سليم", ""],
  ["سليمة", ""],
  ["-", ""],
  ["", ""],
  [undefined, ""],
])("health status %p shows the note %p", (value, want) => {
  expect(healthNote({ health_status: value })).toBe(want);
});

test("a user's summary joins role, age, and city", () => {
  const user = { roles: ["مرشد"], birth_date: "1990-05-01", city: "الرملة" };
  expect(userSummary(user, NOW)).toBe("مرشد · العمر 36 · الرملة");
});

test("a user with two roles shows both", () => {
  expect(userSummary({ roles: ["مرشد", "مساعد"] }, NOW)).toBe("مرشد / مساعد");
});

test("a user without roles or details has an empty summary", () => {
  expect(userSummary({ roles: [], birth_date: "", city: " " }, NOW)).toBe("");
  expect(userSummary({}, NOW)).toBe("");
});

test("parts are joined with a dot and empty parts are skipped", () => {
  expect(joinParts(["السبت", " ", "26/09/2026", null, "ايمن الوهباني"])).toBe("السبت · 26/09/2026 · ايمن الوهباني");
  expect(joinParts([])).toBe("");
});
