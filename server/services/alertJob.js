// Periodic alerts, every 15 minutes between 07:00 and 21:00 Asia/Jerusalem:
//   lesson_no_attendance  a lesson that ended today has no attendance rows
//                         -> its teacher and helper, and lessons.viewAll holders
//   absence_streak        a student's latest three recorded rows are absences
//                         (nightly automatic absences are skipped); one alert
//                         per run of absences -> users whose scope includes
//                         the student
//   report_missing        from 20:00: a teacher who had a lesson today has no
//                         report dated today -> that teacher, once a day
// Several server processes may run this: each 15-minute slot takes a JobRuns
// lock row first (unique lockKey), so only one process runs a slot.
// Dependencies are injectable for tests.
const cron = require("node-cron");
const { renderAlert, defaultSeverity } = require("./alertTemplates");

const JOB = "alerts";
const TIME_ZONE = "Asia/Jerusalem";
const START_MIN = 7 * 60;
const END_MIN = 21 * 60;
const REPORT_FROM_MIN = 20 * 60;
const { ABSENT_STATUS, isAutoAbsence } = require("../utils/attendanceMarks");

const STREAK = 3;
// How many of a student's latest rows are read to find where a run started
// (a run longer than this is keyed on the oldest row read).
const STREAK_ROWS = 100;
// Absences older than this cannot start a new streak alert.
const STREAK_LOOKBACK_DAYS = 14;
const WEEKDAYS = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
let running = false;

const isDuplicate = (err) => err && (err.code === 11000 || /E11000/.test(String(err.message)));
const pad = (n) => String(n).padStart(2, "0");
const toDateKey = (y, m, d) => y * 10000 + m * 100 + d;

// Jerusalem wall-clock view of `now`.
function jerusalemClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now);
  const pick = (type) => parts.find((p) => p.type === type).value;
  const year = Number(pick("year"));
  const month = Number(pick("month"));
  const day = Number(pick("day"));
  const hour = Number(pick("hour"));
  const minute = Number(pick("minute"));
  const date = `${year}-${pad(month)}-${pad(day)}`;
  return {
    date,
    dateKey: toDateKey(year, month, day),
    dow: WEEKDAYS[pick("weekday")],
    minutes: hour * 60 + minute,
    slot: `${date}T${pad(hour)}:${pad(Math.floor(minute / 15) * 15)}`,
    year, month, day,
  };
}

const dateKeyDaysBefore = (clock, days) => {
  const d = new Date(Date.UTC(clock.year, clock.month - 1, clock.day - days));
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};
const jerusalemDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : jerusalemClock(d).date;
};
const fullName = (p = {}) => [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
const lessonsToday = (lessons, clock) => (lessons || []).filter((l) => Number(l?.date?.day) === clock.dow);

async function raise(deps, type, { params, rule, link, dedupKey }) {
  const recipients = await deps.engine.recipientsFor(rule);
  if (!recipients.length) return 0;
  const { created } = await deps.engine.raise({
    type, severity: defaultSeverity(type), text: renderAlert(type, params), link, dedupKey, recipients,
  });
  return created.length;
}

async function checkLessonsWithoutAttendance(deps, clock, lessons) {
  const ended = lessonsToday(lessons, clock).filter((l) =>
    Number(l?.date?.endMin) <= clock.minutes && Array.isArray(l.list_students) && l.list_students.length > 0);
  if (!ended.length) return 0;
  const recorded = new Set(((await deps.attendanceForDay(clock.dateKey)) || []).map((r) => String(r.lesson)));
  let raised = 0;
  for (const lesson of ended) {
    const id = String(lesson._id);
    if (recorded.has(id)) continue;
    raised += await raise(deps, "lesson_no_attendance", {
      params: { lesson: lesson.name },
      rule: [{ userIds: [lesson.teacher, lesson.helper].filter(Boolean) }, { permission: "lessons.viewAll" }],
      link: `/lessons/${id}`,
      dedupKey: `lesson_no_attendance:${id}:${clock.date}`,
    });
  }
  return raised;
}

// Newest first: by dateKey, then by the time the row was last written.
const newestFirst = (a, b) => (Number(b.dateKey) - Number(a.dateKey))
  || (new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

// The current run of absences, newest first. Absences the nightly job created
// (nobody recorded them) are skipped: they neither count nor break a run.
function currentAbsenceRun(rows) {
  const run = [];
  for (const row of [...rows].sort(newestFirst)) {
    if (isAutoAbsence(row)) continue;
    if (row.status !== ABSENT_STATUS) break;
    run.push(row);
  }
  return run;
}

async function checkAbsenceStreaks(deps, clock) {
  const recent = ((await deps.recentAbsences(dateKeyDaysBefore(clock, STREAK_LOOKBACK_DAYS), clock.dateKey)) || [])
    .filter((r) => !isAutoAbsence(r));
  const studentIds = [...new Set(recent.map((r) => String(r.student)).filter(Boolean))];
  let raised = 0;
  for (const studentId of studentIds) {
    const run = currentAbsenceRun((await deps.attendanceOfStudent(studentId, clock.dateKey, STREAK_ROWS)) || []);
    if (run.length < STREAK) continue;
    const student = await deps.findStudent(studentId);
    if (!student) continue;
    // One alert per streak: keyed on where the run started, so a 4th, 5th…
    // absence in the same run never alerts again.
    const startKey = run[run.length - 1].dateKey;
    raised += await raise(deps, "absence_streak", {
      params: { name: fullName(student), count: STREAK },
      rule: { scopeOfStudent: studentId, permission: "attendance.view" },
      link: `/students/${student.tz}`,
      dedupKey: `absence_streak:${studentId}:${startKey}`,
    });
  }
  return raised;
}

async function checkMissingReports(deps, clock, lessons, now) {
  if (clock.minutes < REPORT_FROM_MIN) return 0;
  const teacherIds = [...new Set(lessonsToday(lessons, clock).map((l) => String(l.teacher || "")).filter(Boolean))];
  if (!teacherIds.length) return 0;
  // A wide window, then the Jerusalem date decides.
  const day = 24 * 60 * 60 * 1000;
  const reports = (await deps.reportsBetween(new Date(now.getTime() - 2 * day), new Date(now.getTime() + 2 * day))) || [];
  const authors = new Set(reports.filter((r) => jerusalemDate(r.date) === clock.date).map((r) => String(r.createdBy || "").trim()));
  const users = (await deps.listActiveUsers()) || [];
  let raised = 0;
  for (const teacherId of teacherIds) {
    const teacher = users.find((u) => String(u._id) === teacherId);
    if (!teacher) continue;
    if (authors.has(teacherId) || authors.has(String(teacher.tz))) continue;
    raised += await raise(deps, "report_missing", {
      params: {},
      rule: { userIds: [teacherId] },
      link: "/reports",
      dedupKey: `report_missing:${teacherId}:${clock.date}`,
    });
  }
  return raised;
}

async function runAlertJob({ now = new Date(), deps = createDeps() } = {}) {
  const clock = jerusalemClock(now);
  if (clock.minutes < START_MIN || clock.minutes > END_MIN) return { skipped: "outside_hours" };
  if (running) return { skipped: "running" };
  running = true;
  const result = { slot: clock.slot, raised: 0, errors: [] };
  try {
    if (!(await deps.acquireLock(`${JOB}:${clock.slot}`, clock))) return { skipped: "locked", slot: clock.slot };
    let lessons = [];
    try {
      lessons = (await deps.listLessons()) || [];
    } catch (error) {
      result.errors.push(`lessons: ${error.message}`);
      deps.log("lessons failed", error);
    }
    const checks = [
      ["lesson_no_attendance", () => checkLessonsWithoutAttendance(deps, clock, lessons)],
      ["absence_streak", () => checkAbsenceStreaks(deps, clock)],
      ["report_missing", () => checkMissingReports(deps, clock, lessons, now)],
    ];
    for (const [name, check] of checks) {
      try {
        result.raised += await check();
      } catch (error) {
        result.errors.push(`${name}: ${error.message}`);
        deps.log(`${name} failed`, error);
      }
    }
    return result;
  } finally {
    running = false;
  }
}

function createDeps() {
  const { JobRunModelDef } = require("../Entities/Notice/Notice.model");
  const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
  const { AttendanceModelDef } = require("../Entities/Attendance/Attendance.model");
  const { StudentModelDef } = require("../Entities/Student/Student.model");
  const { ReportModelDef } = require("../Entities/Report/Report.model");
  const { UserModelDef } = require("../Entities/User/User.model");
  const { getAlertEngine } = require("./alertEngine");
  const { logWithSource } = require("../middleware/logger");
  const rows = (res) => res?.result || [];
  return {
    engine: getAlertEngine(),
    listActiveUsers: async () => rows(await UserModelDef.get({}, "active")),
    listLessons: async () => rows(await LessonModelDef.get({})),
    attendanceForDay: async (dateKey) => rows(await AttendanceModelDef.get({ dateKey })),
    recentAbsences: async (fromKey, toKey) =>
      rows(await AttendanceModelDef.get({ status: ABSENT_STATUS, dateKey: { $gte: fromKey, $lte: toKey } })),
    // Newest first, at most `limit` rows (sort and limit run in MongoDB).
    attendanceOfStudent: async (studentId, toKey, limit) =>
      (await AttendanceModelDef.latestOfStudent(studentId, toKey, limit)) || [],
    findStudent: async (id) => rows(await StudentModelDef.get({ _id: String(id) }))[0] || null,
    reportsBetween: async (from, to) => rows(await ReportModelDef.get({ date: { $gte: from, $lt: to } })),
    // The unique lockKey index (Notice.model) makes the insert the lock.
    async acquireLock(lockKey, clock) {
      try {
        // lockedAt is a Date: the 7-day TTL index removes old lock rows.
        await JobRunModelDef.create({ job: JOB, date: clock.date, lockKey, lockedAt: new Date() });
        return true;
      } catch (error) {
        if (isDuplicate(error)) return false;
        throw error;
      }
    },
    log: (...args) => logWithSource("[alertJob]", ...args),
  };
}

function startAlertJob() {
  // The window check inside the run decides; the cron just ticks every 15 min.
  cron.schedule("*/15 * * * *", () =>
    runAlertJob().catch((err) => console.error("[alertJob] run failed:", err?.message || err)), { timezone: TIME_ZONE });
}

module.exports = { runAlertJob, startAlertJob, jerusalemClock, createDeps };
