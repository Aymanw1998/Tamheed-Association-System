// jobs/attendanceDailyScan.js
const Attendance = require("../Entities/Attendance/Attendance.model");
const Lesson = require("../Entities/Lesson/Lesson.model");
const { logWithSource } = require("../middleware/logger");

// notifications (اختياري)
let notify = null;
try {
  ({ notify } = require("../Entities/Notification/Notification.controller")); // عدّل المسار حسب مشروعك
} catch (e) {
  notify = null;
}

const toDateKey = (y, m, d) => Number(y) * 10000 + Number(m) * 100 + Number(d);

function getIsraelParts() {
  const tz = "Asia/Jerusalem";
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  const weekdayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(now);

  const map = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
  const weekday = map[weekdayStr] || 1;

  return { year, month, day, weekday };
}

async function safeNotify(payload) {
  try {
    if (typeof notify === "function") await notify(payload);
  } catch (e) {
    logWithSource("AttendanceDailyScan.safeNotify", e);
  }
}

async function scanAttendanceFillMissing() {
  const { year, month, day, weekday } = getIsraelParts();
  const dateKey = toDateKey(year, month, day);

  console.log("[attendance-scan] start", { year, month, day, weekday, dateKey });

  const lessons = await Lesson.find({ "date.day": weekday })
    .select("_id name list_students")
    .lean();

  const summary = []; // {lessonId, lessonName, missingCount}
  let totalMissing = 0;

  for (const lesson of lessons) {
    const students = Array.isArray(lesson.list_students) ? lesson.list_students : [];
    if (!students.length) continue;

    // ✅ 1) كل سجلات الحضور الموجودة لهذا الدرس اليوم
    const existing = await Attendance.find({ lesson: lesson._id, dateKey })
      .select("student")
      .lean();

    const existingSet = new Set(existing.map((a) => String(a.student)));

    // ✅ 2) الطلاب الناقصين فقط
    const missingStudents = students.filter((sid) => !existingSet.has(String(sid)));
    if (!missingStudents.length) continue;

    // ✅ 3) upsert للناقصين فقط — ما بنلمس الموجودين
    const ops = missingStudents.map((studentId) => ({
      updateOne: {
        filter: { lesson: lesson._id, student: studentId, dateKey },
        update: {
          $setOnInsert: {
            lesson: lesson._id,
            student: studentId,
            year,
            month,
            day,
            dateKey,
            status: "غائب",
            notes: "غياب تلقائي (لم يتم تسجيل حضور حتى 23:00)",
          },
        },
        upsert: true,
      },
    }));

    await Attendance.bulkWrite(ops, { ordered: false });

    summary.push({
      lessonId: String(lesson._id),
      lessonName: lesson.name || "",
      missingCount: missingStudents.length,
    });
    totalMissing += missingStudents.length;

    console.log(
      `[attendance-scan] filled missing: lesson=${lesson.name} missing=${missingStudents.length}`
    );
  }

  // ✅ Notification واحدة للإدارة
  if (summary.length) {
    const msgLines = summary
      .slice(0, 10)
      .map((x) => `• ${x.lessonName || x.lessonId}: ${x.missingCount}`)
      .join("\n");

    await safeNotify({
      toRoles: ["ادارة"],
      module: "ATTENDANCE",
      action: "AUTO_ABSENT_FILL_MISSING",
      type: "WARN",
      title: "تسجيل غياب تلقائي (للناقصين)",
      message:
        `تم تسجيل غياب تلقائي للطلاب الذين لم يتم تسجيلهم حتى 23:00\n` +
        `التاريخ: ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}\n` +
        `عدد الدروس المتأثرة: ${summary.length} — مجموع الطلاب الناقصين: ${totalMissing}\n` +
        (msgLines ? msgLines : ""),
      entity: { kind: "attendance", id: null },
      meta: { year, month, day, dateKey, summary, totalMissing },
      createdBy: null,
    });
  }

  console.log("[attendance-scan] done", {
    lessons: lessons.length,
    affectedLessons: summary.length,
    totalMissing,
  });

  return { ok: true, dateKey, affectedLessons: summary.length, totalMissing, summary };
}

async function runDailyJobs() {
    // await haveTraineeWithoutSubs3Month();
    // await checkSubIsOk();
    await scanAttendanceFillMissing();
}

module.exports = {runDailyJobs};