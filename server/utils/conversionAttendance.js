// Attendance of a student who became staff (owner, 2026-11-19; spec
// docs/superpowers/specs/2026-11-19-student-to-staff-design.md, section D).
//
// The cutover is staffConversion.cutoverDateKey: the day after the conversion
// started. For one person, one program, one date:
// - a program in plannedLessons, before the cutover: the student row only;
// - a program in plannedLessons, the cutover or later: the staff row only;
// - any other program: no new student row, staff rows only from the cutover.
// Stored rows are never hidden from history; this decides which rows a sheet,
// a save and the nightly job show, accept or create.
//
// conversionRules returns { skipStudents, skipUsers, addStudents }:
// skipStudents / skipUsers: ids not shown, accepted or created on this date;
// addStudents: student records to show (and accept) although they are no
// longer on the roster (moved programs, before the cutover).

const { savedByPerson } = require("./attendanceMarks");

const CONVERTING_PHASES = new Set(["prepared", "account", "rosters", "done"]);
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const conversionOf = (student) => {
  const conv = student?.staffConversion;
  return conv && CONVERTING_PHASES.has(conv.phase) && Number(conv.cutoverDateKey) > 0 ? conv : null;
};
const plans = (conv, lessonId) => (Array.isArray(conv?.plannedLessons) ? conv.plannedLessons : []).some((id) => String(id) === String(lessonId));

async function readOne(model, filter, room) {
  if (!OBJECT_ID.test(String(filter._id || ""))) return null;
  const found = room ? await model.get(filter, room) : await model.get(filter);
  if (!found || found.success === false) throw new Error("lookup failed");
  return (found.result || [])[0] || null;
}

/**
 * lessonId, dateKey: the sheet. rosterStudents: student records (or ids) on the
 * roster; userIds: participating user ids. students / users: the models.
 */
// alsoCheck: more student ids to apply the cutover to (a save's submitted ids).
async function conversionRules({ lessonId, dateKey, rosterStudents = [], userIds = [], students, users, alsoCheck = [] }) {
  const skipStudents = new Set();
  const skipUsers = new Set();
  const addStudents = [];
  const day = Number(dateKey);

  const rosterKeys = new Set(rosterStudents.map((s) => String(typeof s === "object" && s ? s._id : s)));
  const entries = [...rosterStudents, ...alsoCheck.filter((x) => !rosterKeys.has(String(x)))];
  // Ids are read in one query, not one by one (testing review, 2026-11-20).
  const ids = [...new Set(entries.filter((e) => !(typeof e === "object" && e)).map(String).filter((x) => OBJECT_ID.test(x)))];
  const byId = new Map();
  if (ids.length) {
    const found = await students.get({ _id: { $in: ids } });
    if (!found || found.success === false) throw new Error("lookup failed");
    for (const s of found.result || []) byId.set(String(s._id), s);
  }
  for (const entry of entries) {
    const student = typeof entry === "object" && entry ? entry : byId.get(String(entry)) || null;
    const conv = conversionOf(student);
    if (conv && day >= Number(conv.cutoverDateKey)) skipStudents.add(String(student._id));
  }
  const onRoster = new Set(rosterStudents.map((s) => String(typeof s === "object" && s ? s._id : s)));

  for (const userId of userIds) {
    const user = await readOne(users, { _id: String(userId) }, "active");
    if (!user?.fromStudentId) continue;
    const student = await readOne(students, { _id: String(user.fromStudentId) });
    const conv = conversionOf(student);
    if (!conv) continue;
    if (day < Number(conv.cutoverDateKey)) {
      skipUsers.add(String(userId));
      if (plans(conv, lessonId) && !onRoster.has(String(student._id))) addStudents.push(student);
    }
  }
  return { skipStudents, skipUsers, addStudents };
}

// Whether a stored row of this student on this date is his history as a
// student: he is becoming (or became) staff and the date is before the
// cutover. The sheet shows it, the save accepts it and the export keeps it,
// whether or not the program is in his plan (he may have left it before the
// conversion) and whatever the actor's student scope (Codex build reviews).
const historyRowOf = (student, dateKey) => {
  const conv = conversionOf(student);
  return Boolean(conv) && Number(dateKey) < Number(conv.cutoverDateKey);
};

// Settles one student row on or after the cutover (spec section D): a row
// never saved by a person is deleted; a row a person saved becomes his staff
// row (unless one exists for that date, then the student row goes), in any
// program: the mark is not lost (Codex build review 3) and he is never
// counted twice, as student and as staff, on one date (Codex build review 4).
// Conditional on the row as read (its updatedAt), never an upsert.
// Returns whether the write hit (false: the row changed meanwhile, read again).
async function settleStudentRow(attendance, row, conv) {
  const asRead = { _id: String(row._id), updatedAt: row.updatedAt ?? null };
  let done;
  if (!savedByPerson(row)) {
    done = await attendance.delete(asRead);
  } else {
    const staffRow = await attendance.get({ lesson: String(row.lesson), user: String(conv.userId), dateKey: Number(row.dateKey) });
    if (!staffRow || staffRow.success === false) throw new Error("attendance lookup failed");
    if ((staffRow.result || []).length) {
      done = await attendance.delete(asRead);
    } else {
      done = await attendance.updateExisting(asRead, { student: null, user: String(conv.userId), updatedAt: new Date() });
      // A sheet may have added his empty staff row between the check and the
      // re-key: one row stays (Codex build review 5).
      if (done?.result) await dropDuplicateRows(attendance, { lesson: String(row.lesson), user: String(conv.userId), dateKey: Number(row.dateKey) });
    }
  }
  return Boolean(done?.result) && (done.result.deletedCount === undefined || done.result.deletedCount > 0);
}

// One person, one program, one date: one row. When more exist (two writers
// raced), the row a person saved last stays, else the first one; the others
// go only if no person saved them (conditional on their updatedAt).
async function dropDuplicateRows(attendance, filter) {
  const found = await attendance.get(filter);
  if (!found || found.success === false) throw new Error("attendance lookup failed");
  const rows = found.result || [];
  if (rows.length < 2) return;
  const time = (v) => new Date(v || 0).getTime() || 0;
  const saved = rows.filter(savedByPerson).sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  const keep = saved[0] || rows[0];
  for (const extra of rows) {
    if (String(extra._id) === String(keep._id) || savedByPerson(extra)) continue;
    await attendance.delete({ _id: String(extra._id), updatedAt: extra.updatedAt ?? null });
  }
}

module.exports = { conversionRules, conversionOf, historyRowOf, settleStudentRow, dropDuplicateRows, plans, CONVERTING_PHASES };
