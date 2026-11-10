import { attendanceSheets, studentsSheet, playersSheet, safeFileName, writeWorkbook } from "./excelExport";

// Excel export (owner, 2026-11-10): the file is built in the browser from
// what the viewer already sees. Synthetic data only.
const ROWS = [
  { dateKey: 20261104, name: "طالب أ", kind: "student", status: "حاضر", notes: "" },
  { dateKey: 20261104, name: "موظف ب", kind: "user", status: "متأخر", notes: "" },
  { dateKey: 20261111, name: "طالب أ", kind: "student", status: "غائب", notes: "مرض", auto: false },
  { dateKey: 20261111, name: "موظف ب", kind: "user", status: "غائب", notes: "", auto: true },
];

test("attendance gives a detail sheet and a per-person summary", () => {
  const [detail, summary] = attendanceSheets(ROWS);
  expect(detail.name).toBe("الحضور");
  expect(detail.columns.map((c) => c.header)).toEqual(["التاريخ", "الاسم", "النوع", "الحالة", "ملاحظات"]);
  expect(detail.rows[0]).toEqual(["04/11/2026", "طالب أ", "طالب", "حاضر", ""]);
  expect(detail.rows[3]).toEqual(["11/11/2026", "موظف ب", "موظف", "غائب", "غياب تلقائي (لم يُسجَّل الحضور)"]);
  expect(summary.name).toBe("ملخص");
  expect(summary.columns.map((c) => c.header)).toEqual(["الاسم", "النوع", "حاضر", "متأخر", "غائب", "نسبة الحضور"]);
  expect(summary.rows).toEqual([
    ["طالب أ", "طالب", 1, 0, 1, "50%"],
    ["موظف ب", "موظف", 0, 1, 1, "50%"],
  ]);
});

test("the summary lists students before staff, by name", () => {
  const [, summary] = attendanceSheets([
    { dateKey: 1, name: "ي", kind: "user", status: "حاضر" },
    { dateKey: 1, name: "ب", kind: "student", status: "حاضر" },
    { dateKey: 1, name: "أ", kind: "student", status: "حاضر" },
  ]);
  expect(summary.rows.map((r) => r[0])).toEqual(["أ", "ب", "ي"]);
});

test("the students sheet has the columns of the list", () => {
  const sheet = studentsSheet([{ firstname: "طالب", lastname: "أ", tz: "900000401", layer: "ط3", school: "مدرسة", city: "الرملة", status: "active", mainTeacherName: "مرشد" }]);
  expect(sheet.columns.map((c) => c.header)).toEqual(["الاسم", "رقم الهوية", "الصف", "المدرسة", "المدينة", "المرشد"]);
  expect(sheet.rows).toEqual([["طالب أ", "900000401", "ط3", "مدرسة", "الرملة", "مرشد"]]);
});

test("the players sheet leaves a staff player's stats empty", () => {
  const stats = [{ key: "g", label: "أهداف" }];
  const sheet = playersSheet([
    { firstname: "طالب", lastname: "أ", kind: "student", tz: "1", age: 12, jerseyNumber: 7, position: "مهاجم", lessons: [{ name: "أشبال" }], attendance: { rate: 90, late: 1 }, values: { g: 3 } },
    { firstname: "موظف", lastname: "ب", kind: "user", tz: "2", age: 30, jerseyNumber: null, position: "", lessons: [], attendance: { rate: null, late: 0 }, values: {} },
  ], stats);
  expect(sheet.columns.map((c) => c.header)).toEqual(["الاسم", "النوع", "رقم الهوية", "العمر", "البرامج", "رقم القميص", "المركز", "الحضور", "التأخير", "أهداف"]);
  expect(sheet.rows[0]).toEqual(["طالب أ", "طالب", "1", 12, "أشبال", 7, "مهاجم", "90%", 1, 3]);
  expect(sheet.rows[1]).toEqual(["موظف ب", "موظف", "2", 30, "", "", "", "", 0, ""]);
});

test("file names keep Arabic and drop characters Windows refuses", () => {
  expect(safeFileName('حضور: كرة/القدم?*')).toBe("حضور كرة القدم");
  expect(safeFileName("")).toBe("تصدير");
});

test("writeWorkbook builds right-to-left sheets with a bold, frozen header", async () => {
  const made = [];
  class FakeWorkbook {
    constructor() { this.xlsx = { writeBuffer: async () => new Uint8Array([1, 2]) }; }
    addWorksheet(name, options) {
      const sheet = { name, options, rows: [], columns: null, autoFilter: null, getRow: () => ({ font: null }) };
      sheet.addRow = (r) => sheet.rows.push(r);
      made.push(sheet);
      return sheet;
    }
  }
  const blob = await writeWorkbook(attendanceSheets(ROWS), { load: async () => ({ Workbook: FakeWorkbook }) });
  expect(blob.size).toBe(2);
  expect(made.map((s) => s.name)).toEqual(["الحضور", "ملخص"]);
  expect(made[0].options.views[0]).toEqual({ rightToLeft: true, state: "frozen", ySplit: 1 });
  expect(made[0].rows).toHaveLength(4);
  expect(made[0].autoFilter).toBeTruthy();
});
