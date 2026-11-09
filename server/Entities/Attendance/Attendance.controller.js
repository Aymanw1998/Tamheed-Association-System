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

    const students = lesson.list_students || [];
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
    const participants = await participantsOf(baseLesson);

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
    // The sheet's version (what bulk-save compares baseVersion with): only the
    // rows a person saved count, not the rows created just now.
    const { version } = sheetVersion(existingRows);

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
    let studentItems = submitted.filter((item) => !isUserItem(item));
    if (visible) {
      const roster = new Set(((await getLessonById(String(lessonId)))?.list_students || []).map(String));
      studentItems = studentItems.filter((item) => {
        const key = String(item?.studentId);
        return visible.has(key) && roster.has(key);
      });
    }
    // A participating user's row only for an active user on this lesson (users
    // are not scoped by students: whoever may open the lesson records them).
    const onLesson = new Set((await participantsOf(lessonDoc)).map((u) => u._id));
    const userItems = submitted.filter((item) => isUserItem(item) && onLesson.has(String(item.userId)));
    // One list of writes: `key` tells students ("s:") and users ("u:") apart.
    const items = [
      ...studentItems.map((item) => ({ item, key: `s:${item.studentId}`, field: { student: String(item.studentId) } })),
      ...userItems.map((item) => ({ item, key: `u:${item.userId}`, field: { user: String(item.userId) } })),
    ];

    const dateKey = calcDateKey(y, m, d);
    const actorId = String(req.actor.id);

    // Rows as they were before the save, to count what this save changed.
    const previous = await AttendanceModelDef.get({ lesson: String(lessonId), dateKey }).catch(() => null);
    const rowKey = (row) => (row.user ? `u:${row.user}` : `s:${row.student}`);
    const previousByKey = new Map((previous?.result || []).map((row) => [rowKey(row), row]));

    // A save made on top of an older sheet is refused (the screen keeps the
    // draft). Only rows a person saved count (utils/attendanceMarks).
    const { last: lastRow } = sheetVersion(previous?.result || []);
    const stale = lastRow ? checkVersion({ updatedAt: lastRow.updatedAt, updatedBy: lastRow.updatedBy, updatedByName: lastRow.updatedByName }, req) : null;
    if (stale) return res.status(409).json(stale);

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
    const studentIds = (Array.isArray(lesson.list_students) ? lesson.list_students : []).map(
      (id) => String(id)
    );
    // The active participating users are marked absent the same way.
    const userIds = (Array.isArray(lesson.list_users) && lesson.list_users.length)
      ? (await participantsOf(lesson).catch(() => [])).map((u) => u._id)
      : [];
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

module.exports = {
  getSheet,
  bulkSave,
  getLessonDates,
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
