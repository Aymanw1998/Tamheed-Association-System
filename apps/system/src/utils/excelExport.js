// Excel export (owner, 2026-11-10). The file is built in the browser from what
// the viewer already sees (the server's answers are already cut to his
// permissions and scope), so an export never shows more than the screen.
// A sheet is { name, columns: [{ header, width }], rows: [[...]] }.
// exceljs is loaded only when a file is made, never with the page.

const KIND = { student: "طالب", user: "موظف" };
const AUTO_NOTE = "غياب تلقائي (لم يُسجَّل الحضور)";

// 20261104 -> "04/11/2026" (day/month/year, Latin digits, like the rest of the system).
export const dateOfKey = (key) => {
  const n = Number(key) || 0;
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(n % 100)}/${pad(Math.floor(n / 100) % 100)}/${Math.floor(n / 10000)}`;
};

const percent = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "");
const kindLabel = (kind) => KIND[kind] || KIND.student;
const byKindThenName = (a, b) => (a.kind === b.kind ? 0 : a.kind === "user" ? 1 : -1) || a.name.localeCompare(b.name, "ar");

// One lesson's marks (GET /api/attendance/export rows): every mark, then one
// line per person with counts and the attendance rate (late counts as present).
export function attendanceSheets(rows) {
  const detail = {
    name: "الحضور",
    columns: [{ header: "التاريخ", width: 12 }, { header: "الاسم", width: 24 }, { header: "النوع", width: 8 }, { header: "الحالة", width: 10 }, { header: "ملاحظات", width: 34 }],
    rows: rows.map((r) => [dateOfKey(r.dateKey), r.name, kindLabel(r.kind), r.status, r.auto ? AUTO_NOTE : r.notes || ""]),
  };
  const people = new Map();
  for (const r of rows) {
    const key = `${r.kind}:${r.name}`;
    const p = people.get(key) || { name: r.name, kind: r.kind, present: 0, late: 0, absent: 0 };
    if (r.status === "حاضر") p.present += 1;
    else if (r.status === "متأخر") p.late += 1;
    else if (r.status === "غائب") p.absent += 1;
    people.set(key, p);
  }
  const summary = {
    name: "ملخص",
    columns: [{ header: "الاسم", width: 24 }, { header: "النوع", width: 8 }, { header: "حاضر", width: 8 }, { header: "متأخر", width: 8 }, { header: "غائب", width: 8 }, { header: "نسبة الحضور", width: 12 }],
    rows: [...people.values()].sort(byKindThenName).map((p) => [
      p.name, kindLabel(p.kind), p.present, p.late, p.absent, percent(p.present + p.late, p.present + p.late + p.absent),
    ]),
  };
  return [detail, summary];
}

const fullName = (p) => `${p?.firstname || ""} ${p?.lastname || ""}`.trim();

// The students list as filtered on screen. `mainTeacherName` is set by the page.
export function studentsSheet(students) {
  return {
    name: "الطلاب",
    columns: [{ header: "الاسم", width: 24 }, { header: "رقم الهوية", width: 14 }, { header: "الصف", width: 8 }, { header: "المدرسة", width: 22 }, { header: "المدينة", width: 14 }, { header: "المرشد", width: 22 }],
    rows: students.map((s) => [fullName(s), String(s.tz || ""), s.layer || "", s.school || "", s.city || "", s.mainTeacherName || ""]),
  };
}

// Football players with the sport's stats; a staff player has none (owner, 2026-11-09).
export function playersSheet(players, stats = []) {
  return {
    name: "اللاعبون",
    columns: [
      { header: "الاسم", width: 24 }, { header: "النوع", width: 8 }, { header: "رقم الهوية", width: 14 }, { header: "العمر", width: 8 },
      { header: "البرامج", width: 28 }, { header: "رقم القميص", width: 10 }, { header: "المركز", width: 12 },
      { header: "الحضور", width: 10 }, { header: "التأخير", width: 10 },
      ...stats.map((s) => ({ header: s.label, width: 10 })),
    ],
    rows: players.map((p) => {
      const staff = p.kind === "user";
      const rate = p.attendance?.rate;
      return [
        fullName(p), kindLabel(p.kind), String(p.tz || ""), p.age ?? "",
        (p.lessons || []).map((l) => l.name).join("، "), p.jerseyNumber ?? "", p.position || "",
        rate === null || rate === undefined ? "" : `${rate}%`, Number(p.attendance?.late) || 0,
        ...stats.map((s) => (staff ? "" : Number(p.values?.[s.key]) || 0)),
      ];
    }),
  };
}

// Characters Windows refuses in a file name are replaced; Arabic stays.
export const safeFileName = (name) => String(name || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "تصدير";

// The .xlsx file as a Blob: right-to-left sheets, bold frozen header, filters.
export async function writeWorkbook(sheets, { load = () => import("exceljs") } = {}) {
  const ExcelJS = await load();
  const Workbook = ExcelJS.Workbook || ExcelJS.default?.Workbook;
  const book = new Workbook();
  for (const sheet of sheets) {
    const ws = book.addWorksheet(sheet.name.slice(0, 31), { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({ header: c.header, width: c.width || 14 }));
    ws.getRow(1).font = { bold: true };
    for (const row of sheet.rows) ws.addRow(row);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }
  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// Builds the file and hands it to the browser as a download.
export async function downloadWorkbook(fileName, sheets) {
  const blob = await writeWorkbook(sheets);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(fileName)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
