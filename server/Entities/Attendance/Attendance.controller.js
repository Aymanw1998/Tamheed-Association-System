const { AttendanceModelDef } = require("./Attendance.model");
const { LessonModelDef } = require("../Lesson/Lesson.model");
const { UserModelDef } = require("../User/User.model");
const { StudentModelDef } = require("../Student/Student.model");
const { logWithSource } = require("../../middleware/logger");

const DEFAULT_STATUS = "حاضر";

const calcDateKey = (y, m, d) => y * 10000 + m * 100 + d;

function teacherName(teacher) {
  if (!teacher) return "";
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

async function ensureMissingRows({ students, lessonId, y, m, d, existingMap, dateKey }) {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      }).catch((error) => {
        logWithSource("Attendance.ensureMissingRows", error);
        return null;
      })
    )
  );
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
      existingRows.map((row) => [String(row.student), row])
    );

    await ensureMissingRows({
      students,
      lessonId,
      y,
      m,
      d,
      existingMap,
      dateKey,
    });

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
    const { lessonId, year, month, day, items } = req.body || {};
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    if (!lessonId || !y || !m || !d || !Array.isArray(items)) {
      return res.status(400).json({
        ok: false,
        message: "lessonId, year, month, day, items required",
      });
    }

    const dateKey = calcDateKey(y, m, d);

    const results = await Promise.all(
      items.map((item) =>
        AttendanceModelDef.update(
          {
            lesson: String(lessonId),
            student: String(item.studentId),
            dateKey,
          },
          {
            year: y,
            month: m,
            day: d,
            dateKey,
            status: item.status ?? DEFAULT_STATUS,
            notes: item.notes ?? "",
            updatedAt: new Date(),
          }
        )
      )
    );

    return res.status(200).json({
      ok: true,
      schema: { result: results },
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

module.exports = {
  getSheet,
  bulkSave,
  getLessonDates,
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
