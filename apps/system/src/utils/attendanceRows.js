// The attendance sheet's rows: students, then the users taking part in the
// lesson (kind "user", owner 2026-11-09). A user row has `userId` instead of
// `studentId`, so every lookup and save goes through these helpers.
const STATUSES = ["حاضر", "متأخر", "غائب"];

export const isStaffRow = (row) => row?.kind === "user";

export const rowKey = (row) => (isStaffRow(row) ? `u:${row.userId}` : row.studentId);

export const toSaveItems = (rows = []) => rows.map((row) => ({
  ...(isStaffRow(row) ? { userId: row.userId } : { studentId: row.studentId }),
  status: row.status,
  notes: row.notes || "",
}));

const countOf = (rows) => Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));

export function sheetCounts(rows = []) {
  const staff = rows.filter(isStaffRow);
  return { students: countOf(rows.filter((r) => !isStaffRow(r))), staff: countOf(staff), staffTotal: staff.length };
}
