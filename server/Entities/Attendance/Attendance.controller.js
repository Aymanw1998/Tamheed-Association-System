const { AttendanceModelDef } = require("./Attendance.model");
const { LessonModelDef } = require("../Lesson/Lesson.model");
const { UserModelDef } = require("../User/User.model");
const { StudentModelDef } = require("../Student/Student.model");
const { logWithSource } = require("../../middleware/logger");
const { audit } = require("../../utils/audit");
const { isSystemTz, SYSTEM_ACTOR_NAME, isHiddenUser } = require("../../utils/permissions");
const { createStudentScope } = require("../../utils/studentScope");
const { ABSENT_STATUS, AUTO_ABSENCE_NOTE, sheetVersion } = require("../../utils/attendanceMarks");
const { checkVersion, editorStamp } = require("../../middleware/lockGuard");
const { notifyChange } = require("../../services/liveHub");
// Without lessons.viewAll: attendance only for the lessons one teaches or assists in.
const { mayOpenLesson } = require("../../utils/lessonAccess");
// Users taking part in a lesson (owner, 2026-11-09): rows keyed by `user`.
const { activeUsers } = require("../../utils/lessonParticipants");
const participantsOf = (lesson) => activeUsers(UserModelDef, lesson?.list_users);
// A student who became staff: student row before the cutover, staff row from
// it (utils/conversionAttendance, owner 2026-11-19).
const { conversionRules, conversionOf, historyRowOf, settleStudentRow, dropDuplicateRows } = require("../../utils/conversionAttendance");
const rulesFor = (lessonId, dateKey, rosterStudents, userIds, alsoCheck = []) => conversionRules({
  lessonId, dateKey, rosterStudents, userIds, alsoCheck, students: StudentModelDef, users: UserModelDef,
});
const NOT_FOUND = { ok: false, message: "غير موجود" };

// Student scope: null (students.viewAll) or the Set of visible student _ids.
const scope = createStudentScope({ lessonModel: LessonModelDef, studentModel: StudentModelDef });

const DEFAULT_STATUS = "حاضر";

const calcDateKey = (y, m, d) => y * 10000 + m * 100 + d;

function teacherName(teacher) {
  if (!teacher) return "";
  // A lesson pointing at the system account shows "النظام", never its name.
  if (isHiddenUser(teacher)) return SYSTEM_ACTOR_NAME;
  if (teacher.name) return teacher.name;
  return `${teacher.firstname || ""} ${teacher.lastname || ""}`.trim();
}

async function getLessonById(lessonId) {
  const result = await LessonModelDef.get({ _id: lessonId }).catch(() => null);
  if(!result) return null;
  if (!result?.result?.length) return null;
  return result.result[0];
}

async function getUserById(userId) {
  if (!userId) return null;
  const result = await UserModelDef.get({ _id: userId }, "active").catch(() => null);
  if(!result) return null;
  if (!result?.result?.length) return null;
  return result.result[0];
}

async function getStudentById(studentId) {
  if (!studentId) return null;
  const result = await StudentModelDef.get({ _id: studentId }).catch(() => null);
  if(!result) return null;
  if (!result?.result?.length) return null;
  return result.result[0];
}

async function hydrateLessonUsersAndStudents(lesson = {}) {
  const teacher = await getUserById(lesson.teacher);
  const studentIds = Array.isArray(lesson.list_students) ? lesson.list_students : [];
  const students = (
    await Promise.all(studentIds.map((studentId) => getStudentById(studentId)))
  ).filter(Boolean);

  return {
    ...lesson,
    teacher,
    list_students: students,
  };
}

function normalizeAttendanceRow(row = {}) {
  return {
    ...row,
    lesson: String(row.lesson || ""),
    student: String(row.student || ""),
    dateKey: Number(row.dateKey || 0),
    year: Number(row.year || 0),
    month: Number(row.month || 0),
    day: Number(row.day || 0),
    notes: row.notes || "",
    status: row.status || DEFAULT_STATUS,
  };
}

async function ensureMissingRows({ students, lessonId, y, m, d, existingMap, dateKey, stamp = new Date() }) {
  const missingStudents = students.filter(
    (student) => !existingMap.has(String(student._id))
  );

  if (!missingStudents.length) return;

  await Promise.all(
    missingStudents.map((student) =>
      AttendanceModelDef.create({
        lesson: String(lessonId),
        student: String(student._id),
        year: y,
        month: m,
        day: d,
        dateKey,
        status: DEFAULT_STATUS,
        notes: "",
        createdAt: stamp,
        updatedAt: stamp,
      }).catch((error) => {
        logWithSource("Attendance.ensureMissingRows", error);
        return null;
      })
    )
  );
}

// The participants' rows for this date, created present when missing.
async function ensureMissingUserRows({ users, lessonId, y, m, d, existing, dateKey, stamp = new Date() }) {
  const missing = users.filter((user) => !existing.has(user._id));
  await Promise.all(missing.map((user) =>
    AttendanceModelDef.create({
      lesson: String(lessonId), user: user._id, year: y, month: m, day: d, dateKey,
      status: DEFAULT_STATUS, notes: "", createdAt: stamp, updatedAt: stamp,
    }).catch((error) => {
      logWithSource("Attendance.ensureMissingUserRows", error);
      return null;
    })));
}

const getSheet = async (req, res) => {
  try {
    const { lessonId, year, month, day } = req.query;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    if (!lessonId || !y || !m || !d) {
      return res.status(400).json({
        ok: false,
        message: "lessonId, year, month, day required",
      });
    }

    const dateKey = calcDateKey(y, m, d);

    const baseLesson = await getLessonById(lessonId);
    if (baseLesson && !mayOpenLesson(req.actor, baseLesson)) return res.status(404).json(NOT_FOUND);
    // Only rows for students the actor can see (no rows are created for the others).
    const visible = baseLesson ? await scope.visibleStudentIds(req.actor) : null;
    if (baseLesson && visible) {
      baseLesson.list_students = (baseLesson.list_students || []).filter((id) => visible.has(String(id)));
    }
    const lesson = baseLesson
      ? await hydrateLessonUsersAndStudents(baseLesson)
      : null;

    if (!lesson) {
      return res.status(404).json({
        ok: false,
        message: "Lesson not found",
      });
    }

    const rules = await rulesFor(lessonId, dateKey, lesson.list_students || [], (await participantsOf(baseLesson)).map((u) => u._id));
    const students = [...(lesson.list_students || []).filter((st) => !rules.skipStudents.has(String(st._id))), ...rules.addStudents];
    const existingResult = await AttendanceModelDef.get({
      lesson: String(lessonId),
      dateKey,
    });

    const existingRows = Array.isArray(existingResult?.result)
      ? existingResult.result.map(normalizeAttendanceRow)
      : [];

    const existingMap = new Map(
      existingRows.filter((row) => !row.user).map((row) => [String(row.student), row])
    );
    const userRows = new Map(existingRows.filter((row) => row.user).map((row) => [String(row.user), row]));
    const participants = (await participantsOf(baseLesson)).filter((u) => !rules.skipUsers.has(String(u._id)));

    const stamp = new Date();
    await ensureMissingRows({
      students,
      lessonId,
      y,
      m,
      d,
      existingMap,
      dateKey,
      stamp,
    });
    await ensureMissingUserRows({ users: participants, lessonId, y, m, d, existing: userRows, dateKey, stamp });
    // The rows just added came from a snapshot: a conversion that finished
    // meanwhile must not keep a student row from its cutover, and a staff row
    // the conversion re-keyed meanwhile is not doubled (Codex build review 5).
    const addedStudents = students.filter((st) => !existingMap.has(String(st._id))).map((st) => String(st._id));
    const addedUsers = participants.filter((u) => !userRows.has(u._id)).map((u) => String(u._id));
    if (addedStudents.length || addedUsers.length) {
      await settleRacedRows(String(lessonId), dateKey, addedStudents);
      for (const uid of addedUsers) await dropDuplicateRows(AttendanceModelDef, { lesson: String(lessonId), user: uid, dateKey });
    }
    // The sheet's version (what bulk-save compares baseVersion with): only the
    // rows a person saved count, not the rows created just now.
    const { version } = sheetVersion(existingRows);

    // A student who became staff: his stored rows before the cutover stay on
    // the sheet even when he left this program or the participants changed
    // (spec section D; Codex build review).
    const shownIds = new Set(students.map((st) => String(st._id)));
    for (const sidKey of existingMap.keys()) {
      if (shownIds.has(sidKey)) continue;
      const former = await getStudentById(sidKey);
      if (historyRowOf(former, dateKey)) { students.push(former); shownIds.add(sidKey); }
    }

    const items = students.map((student) => {
      const row = existingMap.get(String(student._id));
      const studentName =
        student.name ||
        `${student.firstname || ""} ${student.lastname || ""}`.trim();

      return {
        studentId: String(student._id),
        studentName,
        tz: student.tz,
        status: row?.status ?? DEFAULT_STATUS,
        notes: row?.notes ?? "",
      };
    });
    // Then the participating users, marked as staff (kind "user").
    for (const user of participants) {
      const row = userRows.get(user._id);
      items.push({
        userId: user._id,
        studentName: user.name,
        kind: "user",
        status: row?.status ?? DEFAULT_STATUS,
        notes: row?.notes ?? "",
      });
    }

    return res.status(200).json({
      ok: true,
      schema: {
        lessonId: String(lessonId),
        lessonName: lesson.name,
        room: lesson.room,
        teacherName: teacherName(lesson.teacher),
        startMin: lesson.date?.startMin,
        endMin: lesson.date?.endMin,
        year: y,
        month: m,
        day: d,
        dateKey,
        version,
        items,
      },
    });
  } catch (error) {
    logWithSource("Attendance.getSheet", error);
    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
};

// The student rows a save just wrote, for students who are now becoming staff
// with this date on or after their cutover: settled like the conversion does.
// A failed read throws (the save answers an error, never a quiet success).
async function settleRacedRows(lessonId, dateKey, studentIds) {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return;
  const found = await StudentModelDef.get({ _id: { $in: ids } });
  if (!found || found.success === false) throw new Error("student lookup failed");
  for (const student of found.result || []) {
    const id = String(student._id);
    const conv = conversionOf(student);
    if (!conv || Number(dateKey) < Number(conv.cutoverDateKey)) continue;
    // In "prepared" his account may still be refused (tz of other staff): no
    // row is moved to an account that does not exist yet. Until it exists the
    // conversion's own settling, which runs after the account is made, still
    // sees this row (Codex build review 3).
    if (conv.phase === "prepared") {
      const account = await UserModelDef.get({ _id: String(conv.userId) }, "active");
      if (!account || account.success === false) throw new Error("user lookup failed");
      if (!(account.result || []).length) continue;
    }
    for (let attempt = 0; ; attempt += 1) {
      if (attempt > 3) throw new Error("attendance kept changing");
      const rows = await AttendanceModelDef.get({ lesson: lessonId, student: id, dateKey });
      if (!rows || rows.success === false) throw new Error("attendance lookup failed");
      const row = (rows.result || [])[0];
      if (!row || (await settleStudentRow(AttendanceModelDef, row, conv))) break;
    }
  }
}

const bulkSave = async (req, res) => {
  try {
    const { lessonId, year, month, day, items: submitted } = req.body || {};
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    if (!lessonId || !y || !m || !d || !Array.isArray(submitted)) {
      return res.status(400).json({
        ok: false,
        message: "lessonId, year, month, day, items required",
      });
    }

    const lessonDoc = await getLessonById(String(lessonId));
    if (lessonDoc && !mayOpenLesson(req.actor, lessonDoc)) return res.status(404).json(NOT_FOUND);

    // A scoped actor's rows are written only for students he can see who are
    // on this lesson's roster; the rest are ignored (never written).
    const visible = await scope.visibleStudentIds(req.actor);
    const isUserItem = (item) => item?.userId != null && item.userId !== "";
    const saveDateKey = calcDateKey(y, m, d);
    const lessonParticipants = await participantsOf(lessonDoc);
    // A student who became staff (utils/conversionAttendance): before the
    // cutover only his student row, from it only his staff row.
    // Submitted student ids are checked too, not only the current roster: a
    // stale screen cannot save a student row after the cutover (Codex build review).
    const submittedStudents = submitted.filter((item) => !isUserItem(item)).map((item) => String(item?.studentId ?? "")).filter(Boolean);
    const rules = await rulesFor(String(lessonId), saveDateKey, lessonDoc?.list_students || [], lessonParticipants.map((u) => u._id), submittedStudents);
    const formerStudents = new Set(rules.addStudents.map((st) => String(st._id)));
    // Rows as they were before the save, to count what this save changed.
    const previous = await AttendanceModelDef.get({ lesson: String(lessonId), dateKey: saveDateKey }).catch(() => null);
    // His stored rows before the cutover that the sheet shows as history are
    // accepted too (the same rule as the sheet, utils/conversionAttendance
    // historyRowOf): otherwise the edit was dropped while the screen said
    // saved (Codex build review 2). Only existing rows: none is created.
    const storedStudents = new Set((previous?.result || []).filter((row) => !row.user && row.student).map((row) => String(row.student)));
    for (const key of new Set(submittedStudents)) {
      if (!storedStudents.has(key) || formerStudents.has(key)) continue;
      // Only on a program that exists and the actor may open (checked above):
      // a deleted or unreadable program opens no history (Codex build review 3).
      if (lessonDoc && historyRowOf(await getStudentById(key), saveDateKey)) formerStudents.add(key);
    }
    let studentItems = submitted.filter((item) => !isUserItem(item) && !rules.skipStudents.has(String(item?.studentId)));
    if (visible) {
      const roster = new Set((lessonDoc?.list_students || []).map(String));
      studentItems = studentItems.filter((item) => {
        const key = String(item?.studentId);
        return (visible.has(key) && roster.has(key)) || formerStudents.has(key);
      });
    }
    // A participating user's row only for an active user on this lesson (users
    // are not scoped by students: whoever may open the lesson records them).
    const onLesson = new Set(lessonParticipants.map((u) => u._id).filter((uid) => !rules.skipUsers.has(String(uid))));
    const userItems = submitted.filter((item) => isUserItem(item) && onLesson.has(String(item.userId)));
    // One list of writes: `key` tells students ("s:") and users ("u:") apart.
    const items = [
      ...studentItems.map((item) => ({ item, key: `s:${item.studentId}`, field: { student: String(item.studentId) } })),
      ...userItems.map((item) => ({ item, key: `u:${item.userId}`, field: { user: String(item.userId) } })),
    ];

    const dateKey = calcDateKey(y, m, d);
    const actorId = String(req.actor.id);

    const rowKey = (row) => (row.user ? `u:${row.user}` : `s:${row.student}`);
    const previousByKey = new Map((previous?.result || []).map((row) => [rowKey(row), row]));

    // A save made on top of an older sheet is refused (the screen keeps the
    // draft). Only rows a person saved count (utils/attendanceMarks).
    const { last: lastRow } = sheetVersion(previous?.result || []);
    const stale = lastRow ? checkVersion({ updatedAt: lastRow.updatedAt, updatedBy: lastRow.updatedBy, updatedByName: lastRow.updatedByName }, req) : null;
    if (stale) {
      // A refused retry still settles what an earlier save left behind (its
      // cleanup failed after the write) (Codex build review 4).
      await settleRacedRows(String(lessonId), saveDateKey, submittedStudents);
      return res.status(409).json(stale);
    }

    const results = await Promise.all(
      items.map(({ item, field }) =>
        AttendanceModelDef.update(
          {
            lesson: String(lessonId),
            ...field,
            dateKey,
          },
          {
            year: y,
            month: m,
            day: d,
            dateKey,
            status: item.status ?? DEFAULT_STATUS,
            notes: item.notes ?? "",
            // Saved by a person: no longer a nightly automatic absence.
            auto: false,
            ...editorStamp(req),
            updatedAt: new Date(),
          }
        )
      )
    );

    // After the write: a student who started becoming staff while this save
    // was on its way (its checks passed before his conversion's barrier) must
    // not keep a student row from the cutover. The conversion may already have
    // settled the rows, so this save settles its own (re-keyed to his staff
    // row or deleted, utils/conversionAttendance) (Codex build review 2).
    // Every submitted student id is checked, also the ones this save skipped:
    // a row left by an earlier save whose check failed is settled by the
    // retry (Codex build review 3). Only rows the cutover forbids are touched.
    await settleRacedRows(String(lessonId), dateKey, submittedStudents);

    // Marks this save replaced that another person had saved with a different status.
    // Students by their id (as before), users as "u:<id>".
    const overwritten = [...new Set(items.filter(({ item, key }) => {
      const old = previousByKey.get(key);
      return old && old.status !== (item.status ?? DEFAULT_STATUS) && old.updatedBy && String(old.updatedBy) !== actorId;
    }).map(({ item, key }) => (key.startsWith("u:") ? key : String(item.studentId))))];

    const rowsChanged = items.filter(({ item, key }) => {
      const old = previousByKey.get(key);
      return !old || old.status !== (item.status ?? DEFAULT_STATUS) || (old.notes ?? "") !== (item.notes ?? "");
    }).length;
    // One audit row per save (not per student), and none when nothing was written.
    if (items.length > 0) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const lesson = await getLessonById(String(lessonId));
      await audit.record(req, {
        module: "attendance", action: "update", targetType: "lesson",
        targetId: String(lessonId),
        targetLabel: [lesson?.name, date].filter(Boolean).join(" "),
        before: null,
        after: { lesson: String(lessonId), date, rowsSaved: items.length, rowsChanged },
      });
      notifyChange("attendance", `${lessonId}:${date}`);
    }

    return res.status(200).json({
      ok: true,
      schema: { result: results },
      overwritten,
    });
  } catch (error) {
    logWithSource("Attendance.bulkSave", error);
    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
};

const getLessonDates = async (req, res) => {
  try {
    const { lessonId } = req.query;

    if (!lessonId) {
      return res.status(400).json({
        ok: false,
        message: "lessonId required",
      });
    }

    const lesson = await getLessonById(String(lessonId));
    if (lesson && !mayOpenLesson(req.actor, lesson)) return res.status(404).json(NOT_FOUND);

    const rowsResult = await AttendanceModelDef.get({
      lesson: String(lessonId),
    });

    const rows = Array.isArray(rowsResult?.result)
      ? rowsResult.result.map(normalizeAttendanceRow)
      : [];

    const uniqueDateKeys = [...new Set(rows.map((row) => row.dateKey))]
      .filter(Boolean)
      .sort((a, b) => b - a)
      .slice(0, 500);

    const dates = uniqueDateKeys.map((dateKey) => {
      const y = Math.floor(dateKey / 10000);
      const m = Math.floor((dateKey % 10000) / 100);
      const d = dateKey % 100;
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");

      return {
        dateKey,
        year: y,
        month: m,
        day: d,
        ymd: `${dd}/${mm}/${y}`,
      };
    });

    return res.status(200).json({
      ok: true,
      schema: dates,
    });
  } catch (error) {
    logWithSource("Attendance.getLessonDates", error);
    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
};

async function runDailyAbsenceJob({ year, month, day, dow1to7 }) {
  const dateKey = calcDateKey(year, month, day);

  const lessonsResult = await LessonModelDef.get({ "date.day": dow1to7 }).catch((error) => {
    logWithSource("Attendance.runDailyAbsenceJob.getLessons", error);
    return null;
  });

  const lessons = Array.isArray(lessonsResult?.result) ? lessonsResult.result : [];
  let createdAbsences = 0;

  for (const lesson of lessons) {
    let studentIds = (Array.isArray(lesson.list_students) ? lesson.list_students : []).map(
      (id) => String(id)
    );
    // The active participating users are marked absent the same way.
    let userIds = (Array.isArray(lesson.list_users) && lesson.list_users.length)
      ? (await participantsOf(lesson).catch(() => [])).map((u) => u._id)
      : [];
    // A student who became staff: absent as a student before the cutover,
    // as staff from it (utils/conversionAttendance). A failed read skips him.
    // A failed read skips this program tonight rather than guess (Codex build review).
    const rules = await rulesFor(String(lesson._id), dateKey, studentIds, userIds)
      .catch((error) => { logWithSource("Attendance.runDailyAbsenceJob.conversion", error); return null; });
    if (!rules) continue;
    studentIds = [...studentIds.filter((id) => !rules.skipStudents.has(id)), ...rules.addStudents.map((st) => String(st._id))];
    userIds = userIds.filter((id) => !rules.skipUsers.has(String(id)));
    if (!studentIds.length && !userIds.length) continue;

    const existingResult = await AttendanceModelDef.get({
      lesson: String(lesson._id),
      dateKey,
    }).catch((error) => {
      logWithSource("Attendance.runDailyAbsenceJob.getExisting", error);
      return null;
    });

    const existingRows = Array.isArray(existingResult?.result) ? existingResult.result : [];
    const existingStudentIds = new Set(existingRows.filter((row) => !row.user).map((row) => String(row.student)));
    const existingUserIds = new Set(existingRows.filter((row) => row.user).map((row) => String(row.user)));

    const missing = [
      ...studentIds.filter((id) => !existingStudentIds.has(id)).map((id) => ({ student: id })),
      ...userIds.filter((id) => !existingUserIds.has(id)).map((id) => ({ user: id })),
    ];
    if (!missing.length) continue;

    await Promise.all(
      missing.map((who) =>
        AttendanceModelDef.create({
          lesson: String(lesson._id),
          ...who,
          year,
          month,
          day,
          dateKey,
          status: ABSENT_STATUS,
          notes: AUTO_ABSENCE_NOTE,
          // Automatic, not recorded by a person (the alert job's streaks skip it).
          auto: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).catch((error) => {
          logWithSource("Attendance.runDailyAbsenceJob.create", error);
          return null;
        })
      )
    );

    createdAbsences += missing.length;
  }

  logWithSource(
    "Attendance.runDailyAbsenceJob",
    `dateKey=${dateKey} lessonsChecked=${lessons.length} createdAbsences=${createdAbsences}`
  );

  return { ok: true, lessonsChecked: lessons.length, createdAbsences };
}

// GET /api/attendance/export?lessonId&from&to (owner, 2026-11-10): one
// lesson's marks over a period, for the Excel file the browser builds. Only
// what the actor may see: the lesson must open for him, and student rows are
// kept for students in his scope (users on the lesson are shown on its sheet
// too). Names only; no ID numbers. At most EXPORT_MAX_DAYS days.
const EXPORT_MAX_DAYS = 366;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function dayOf(value) {
  const m = DATE_RE.exec(String(value || ""));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(t).toISOString().slice(0, 10) !== value) return null;
  return { t, key: calcDateKey(Number(m[1]), Number(m[2]), Number(m[3])) };
}
const personName = (p) => `${p?.firstname || ""} ${p?.lastname || ""}`.trim();

const exportAttendance = async (req, res) => {
  try {
    const { lessonId } = req.query;
    const from = dayOf(req.query.from);
    const to = dayOf(req.query.to);
    if (!lessonId || !from || !to || to.t < from.t || (to.t - from.t) / 86400000 >= EXPORT_MAX_DAYS) {
      return res.status(400).json({ ok: false, message: "الفترة غير صحيحة (حتى سنة واحدة)" });
    }
    const lesson = await getLessonById(lessonId);
    if (!lesson || !mayOpenLesson(req.actor, lesson)) return res.status(404).json(NOT_FOUND);
    const visible = await scope.visibleStudentIds(req.actor);
    const found = await AttendanceModelDef.get({ lesson: String(lesson._id), dateKey: { $gte: from.key, $lte: to.key } });
    // A student who became staff left the scope with his rosters; his rows in
    // a program he was moved out of stay in its export (Codex build review).
    const formerHere = new Map();
    if (visible) {
      const hidden = [...new Set((found?.result || []).filter((r) => !r.user && r.student && !visible.has(String(r.student))).map((r) => String(r.student)))];
      for (const id of hidden) {
        const former = await getStudentById(id);
        if (conversionOf(former)) formerHere.set(id, former);
      }
    }
    // The same rows as the sheet shows: his rows before the cutover, whether
    // or not the program was in his plan (Codex build review 2).
    const keptAsHistory = (r) => formerHere.has(String(r.student)) && historyRowOf(formerHere.get(String(r.student)), r.dateKey);
    const marks = (found?.result || []).map(normalizeAttendanceRow)
      .filter((r) => (r.user ? true : r.student != null && r.student !== "" && (!visible || visible.has(String(r.student)) || keptAsHistory(r))));

    const studentIds = [...new Set(marks.filter((r) => !r.user).map((r) => String(r.student)))];
    const userIds = [...new Set(marks.filter((r) => r.user).map((r) => String(r.user)))];
    const [studentRows, activeRows, formerRows] = await Promise.all([
      studentIds.length ? StudentModelDef.get({ _id: { $in: studentIds } }) : null,
      userIds.length ? UserModelDef.get({ _id: { $in: userIds } }, "active") : null,
      userIds.length ? UserModelDef.get({ _id: { $in: userIds } }, "noActive") : null,
    ]);
    const names = new Map([
      ...(studentRows?.result || []).map((s) => ["s:" + String(s._id), personName(s)]),
      ...[...(formerRows?.result || []), ...(activeRows?.result || [])]
        .map((u) => ["u:" + String(u._id), isHiddenUser(u) ? SYSTEM_ACTOR_NAME : personName(u)]),
    ]);
    const rows = marks.map((r) => {
      const kind = r.user ? "user" : "student";
      const key = r.user ? "u:" + String(r.user) : "s:" + String(r.student);
      return {
        dateKey: Number(r.dateKey), name: names.get(key) || "—", kind,
        status: r.status || "", notes: r.notes || "", auto: Boolean(r.auto),
      };
    }).sort((a, b) => a.dateKey - b.dateKey
      || (a.kind === b.kind ? 0 : a.kind === "student" ? -1 : 1)
      || a.name.localeCompare(b.name, "ar"));
    // No row in the audit log, no file (as for the other exports).
    const written = await audit.recordRequired(req, {
      module: "attendance", action: "export_excel", targetType: "lesson", targetId: String(lesson._id),
      targetLabel: `${lesson.name || ""} ${req.query.from} - ${req.query.to} (${rows.length})`.trim(),
    });
    if (!written) return res.status(503).json({ ok: false, code: "AUDIT_FAILED", message: "تعذر تسجيل العملية في سجل التغييرات، لذلك لم يُصدَّر الملف. حاول مرة أخرى" });
    return res.status(200).json({ ok: true, lesson: { _id: String(lesson._id), name: lesson.name || "" }, rows });
  } catch (err) {
    logWithSource("Attendance.exportAttendance", err);
    return res.status(500).json({ ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" });
  }
};

module.exports = {
  getSheet,
  bulkSave,
  getLessonDates,
  exportAttendance,
  runDailyAbsenceJob,
};

// OLD CODE - DO NOT SUGGEST CHANGES
// const Attendance = require("./Attendance.model");
// const Lesson = require("../Lesson/Lesson.model");
// const { default: mongoose } = require("mongoose");
//
// const calcDateKey = (y, m, d) => (y * 10000) + (m * 100) + d;
//
// function teacherName(t) {
//   if (!t) return "";
//   if (t.name) return t.name;
//   return `${t.firstname || ""} ${t.lastname || ""}`.trim();
// }
//
// async function getSheet(req, res) {
//   console.log("getSheet", req.query);
//   try {
//     const { lessonId, year, month, day } = req.query;
//     const y = Number(year), m = Number(month), d = Number(day);
//
//     if (!lessonId || !y || !m || !d) {
//       return res.status(400).json({ ok: false, message: "lessonId, year, month, day required" });
//     }
//
//     const dateKey = calcDateKey(y, m, d);
//
//     const lesson = await Lesson.findById(lessonId)
//       .populate("teacher", "firstname lastname name")
//       .populate("list_students", "firstname lastname name tz")
//       .select("name date room teacher list_students")
//       .lean();
//
//     if (!lesson) return res.status(404).json({ ok: false, message: "Lesson not found" });
//
//     const students = lesson.list_students || [];
//
//     const existing = await Attendance.find({ lesson: lessonId, dateKey })
//       .select("student status notes")
//       .lean();
//
//     const map = new Map(existing.map(a => [String(a.student), a]));
//
// ملاحظة عربية
//     const items = students.map(st => {
//       const row = map.get(String(st._id));
//       const studentName = st.name || `${st.firstname || ""} ${st.lastname || ""}`.trim();
//       return {
//         studentId: String(st._id),
//         studentName,
//         tz: st.tz,
//         status: row?.status ?? "حاضر",
//         notes: row?.notes ?? "",
//       };
//     });
//
// ملاحظة عربية
//     const missingDocs = students
//       .filter(st => !map.has(String(st._id)))
//       .map(st => ({
//         lesson: lessonId,
//         student: st._id,
//         year: y,
//         month: m,
//         day: d,
//         dateKey,
//         status: "حاضر",
//         notes: "",
//       }));
//
//     if (missingDocs.length) {
//       await Attendance.insertMany(missingDocs, { ordered: false }).catch(() => {});
//     }
//
//     return res.status(200).json({
//       ok: true,
//       schema: {
//         lessonId: String(lessonId),
//         lessonName: lesson.name,
//         room: lesson.room,
//         teacherName: teacherName(lesson.teacher),
//         startMin: lesson.date?.startMin,
//         endMin: lesson.date?.endMin,
//         year: y, month: m, day: d,
//         dateKey,
//         items,
//       },
//     });
//   } catch (err) {
//     console.error("getSheet error:", err);
//     return res.status(500).json({ ok: false, message: "server error" });
//   }
// }
//
// async function bulkSave(req, res) {
//   try {
//     const { lessonId, year, month, day, items } = req.body;
//     const y = Number(year), m = Number(month), d = Number(day);
//
//     if (!lessonId || !y || !m || !d || !Array.isArray(items)) {
//       return res.status(400).json({ ok: false, message: "lessonId, year, month, day, items required" });
//     }
//
//     const dateKey = calcDateKey(y, m, d);
//
//     const ops = items.map(it => ({
//       updateOne: {
//         filter: { lesson: lessonId, student: it.studentId, dateKey },
//         update: {
//           $set: {
//             year: y, month: m, day: d, dateKey,
//             status: it.status ?? "حاضر",
//             notes: it.notes ?? "",
//           },
//         },
//         upsert: true,
//       },
//     }));
//
//     const r = await Attendance.bulkWrite(ops, { ordered: false });
//
//     return res.status(200).json({ ok: true, schema: { result: r } });
//   } catch (err) {
//     console.error("bulkSave error:", err);
//     return res.status(500).json({ ok: false, message: "server error" });
//   }
// }
//
// async function getLessonDates(req, res) {
//   try {
//     const { lessonId } = req.query;
//     console.log("getLessonDates", req.query);
//     if (!lessonId) return res.status(400).json({ ok: false, message: "lessonId required" });
//     const lessonObjId = new mongoose.Types.ObjectId(lessonId);
// ملاحظة عربية
//     const rows = await Attendance.aggregate([
//       { $match: { lesson: lessonObjId } },
//       { $group: { _id: "$dateKey" } },
//       { $sort: { _id: -1 } },
//       { $limit: 500 },
//     ]);
//     console.log(rows);
// ملاحظة عربية
//     const dates = rows.map(r => {
//       const dk = Number(r._id);
//       const y = Math.floor(dk / 10000);
//       const m = Math.floor((dk % 10000) / 100);
//       const d = dk % 100;
//       const mm = String(m).padStart(2, "0");
//       const dd = String(d).padStart(2, "0");
//       return { dateKey: dk, year: y, month: m, day: d, ymd: `${dd}/${mm}/${y}` };
//     });
//   console.log(dates);
//     return res.status(200).json({ ok: true, schema: dates });
//   } catch (err) {
//     console.error("getLessonDates error:", err);
//     return res.status(500).json({ ok: false, message: "server error" });
//   }
// }
//
// module.exports = { getSheet, bulkSave, getLessonDates };
