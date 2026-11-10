// The monthly summary to management (owner, 2026-11-10). From 08:00 on the
// 1st (Israel time), last month's attendance by program, the students with
// MANY_ABSENCES absences or more, and the meetings where nobody took
// attendance, emailed to every active admin (role «ادارة») with a real email.
// Once per month (JobRuns "monthly-summary" + "YYYY-MM"); a server that was
// down on the 1st sends it at its next tick. Automatic absences (the nightly
// job's, nobody recorded) are not absences: they mark an unrecorded meeting.
const { isAutoAbsence } = require("../utils/attendanceMarks");

const JOB = "monthly-summary";
const TIME_ZONE = "Asia/Jerusalem";
const SEND_HOUR = 8;
const MANY_ABSENCES = 3;
// The first month summarised: the deploy in November 2026 must not send October.
const FIRST_PERIOD = "2026-11";
const MAX_LISTED = 30;
const PLACEHOLDER_EMAIL = "test@test.com";

function israelParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour") };
}

// The month before `now` (Israel time): its "YYYY-MM", dateKey range and label.
function previousPeriod(now) {
  const { year, month } = israelParts(now);
  const y = month === 1 ? year - 1 : year;
  const m = month === 1 ? 12 : month - 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { period: `${y}-${mm}`, fromKey: y * 10000 + m * 100 + 1, toKey: y * 10000 + m * 100 + lastDay, label: `${mm}/${y}` };
}

const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isPresent = (status) => status === "حاضر" || status === "متأخر";

function buildMonthlySummary({ lessons, rows, studentNames, label }) {
  const byLesson = new Map();
  const absences = new Map();
  for (const r of rows) {
    const id = String(r.lesson);
    const l = byLesson.get(id) || { recorded: new Set(), autoOnly: new Map(), present: 0, absent: 0, staff: 0 };
    const day = Number(r.dateKey);
    if (isAutoAbsence(r)) {
      if (!l.recorded.has(day)) l.autoOnly.set(day, true);
    } else {
      l.recorded.add(day);
      l.autoOnly.delete(day);
      if (r.user) l.staff += 1;
      else if (isPresent(r.status)) l.present += 1;
      else if (r.status === "غائب") {
        l.absent += 1;
        const sid = String(r.student);
        absences.set(sid, (absences.get(sid) || 0) + 1);
      }
    }
    byLesson.set(id, l);
  }
  const nameOf = new Map(lessons.map((l) => [String(l._id), l.name || "—"]));
  const lessonStats = [...byLesson.entries()].map(([id, l]) => ({
    name: nameOf.get(id) || "—",
    meetings: l.recorded.size,
    present: l.present,
    absent: l.absent,
    rate: l.present + l.absent ? Math.round((l.present / (l.present + l.absent)) * 100) : null,
    staff: l.staff,
    unrecorded: l.autoOnly.size,
  })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const absent = [...absences.entries()]
    .filter(([, n]) => n >= MANY_ABSENCES)
    .map(([sid, n]) => ({ name: studentNames.get(sid) || "—", absences: n }))
    .sort((a, b) => b.absences - a.absences || a.name.localeCompare(b.name, "ar"))
    .slice(0, MAX_LISTED);

  const cell = "padding:6px 10px;border:1px solid #d9dee5;text-align:right";
  const table = (headers, body) => `<table style="border-collapse:collapse;margin:8px 0 18px">`
    + `<tr>${headers.map((h) => `<th style="${cell};background:#f2f4f7">${escape(h)}</th>`).join("")}</tr>`
    + body.map((row) => `<tr>${row.map((v) => `<td style="${cell}">${escape(v)}</td>`).join("")}</tr>`).join("")
    + "</table>";
  const unrecorded = lessonStats.filter((l) => l.unrecorded > 0);
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2933">`
    + `<h2 style="margin:0 0 12px">ملخص شهر ${escape(label)}</h2>`
    + `<h3>الحضور حسب البرنامج</h3>`
    + table(["البرنامج", "لقاءات", "حاضر", "غائب", "نسبة الحضور", "تسجيلات موظفين"],
      lessonStats.map((l) => [l.name, l.meetings, l.present, l.absent, l.rate === null ? "—" : `${l.rate}%`, l.staff]))
    + `<h3>طلاب تغيّبوا ${MANY_ABSENCES} مرات أو أكثر</h3>`
    + (absent.length ? table(["الطالب", "عدد الغيابات"], absent.map((a) => [a.name, a.absences])) : "<p>لا يوجد.</p>")
    + `<h3>لقاءات لم يُسجَّل فيها الحضور</h3>`
    + (unrecorded.length ? table(["البرنامج", "عدد اللقاءات"], unrecorded.map((l) => [l.name, l.unrecorded])) : "<p>لا يوجد.</p>")
    + `<p style="color:#5b6573;font-size:13px">رسالة تلقائية من نظام تمهيد. التفاصيل الكاملة وتصدير Excel في صفحة كل برنامج.</p>`
    + "</div>";
  return { subject: `تمهيد: ملخص شهر ${label}`, html, stats: { lessons: lessonStats, absent } };
}

function createMonthlySummary({ listLessons, listAttendance, studentNames, listRecipients, hasSent, markSent, send, now = () => new Date(), log = () => {} }) {
  return async function runMonthlySummary() {
    const at = now();
    const { day, hour } = israelParts(at);
    if (day === 1 && hour < SEND_HOUR) return { skipped: true };
    const { period, fromKey, toKey, label } = previousPeriod(at);
    if (period < FIRST_PERIOD || await hasSent(period)) return { skipped: true };
    const rows = await listAttendance(fromKey, toKey);
    if (!rows.length) {
      await markSent(period, 0);
      return { sent: 0 };
    }
    const studentIds = [...new Set(rows.filter((r) => !r.user && r.student).map((r) => String(r.student)))];
    const [lessons, names, recipients] = await Promise.all([listLessons(), studentNames(studentIds), listRecipients()]);
    const { subject, html } = buildMonthlySummary({ lessons, rows, studentNames: names, label });
    let sent = 0;
    for (const to of recipients) {
      try {
        await send(to, subject, html);
        sent += 1;
      } catch (err) {
        log("monthlySummary.send", err);
      }
    }
    // Not one delivered: the month stays open and the next tick tries again.
    if (recipients.length && !sent) return { sent: 0 };
    await markSent(period, sent);
    return { sent };
  };
}

function createDeps() {
  const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
  const { AttendanceModelDef } = require("../Entities/Attendance/Attendance.model");
  const { StudentModelDef } = require("../Entities/Student/Student.model");
  const { UserModelDef } = require("../Entities/User/User.model");
  const { JobRunModelDef } = require("../Entities/Notice/Notice.model");
  const { resolveRole, isHiddenUser } = require("../utils/permissions");
  const { sendMonthlySummaryEmail } = require("../utils/sendEmail");
  const { logWithSource } = require("../middleware/logger");
  const rows = (r) => r?.result || [];
  return {
    listLessons: async () => rows(await LessonModelDef.get({})),
    listAttendance: async (fromKey, toKey) => rows(await AttendanceModelDef.get({ dateKey: { $gte: fromKey, $lte: toKey } })),
    studentNames: async (ids) => new Map(ids.length
      ? rows(await StudentModelDef.get({ _id: { $in: ids } })).map((s) => [String(s._id), `${s.firstname || ""} ${s.lastname || ""}`.trim()])
      : []),
    listRecipients: async () => [...new Set(rows(await UserModelDef.get({}, "active"))
      .filter((u) => !isHiddenUser(u) && resolveRole(u) === "ادارة")
      .map((u) => String(u.email || "").trim().toLowerCase())
      .filter((email) => email.includes("@") && email !== PLACEHOLDER_EMAIL))],
    hasSent: async (period) => rows(await JobRunModelDef.get({ job: JOB, date: period })).length > 0,
    markSent: (period, count) => JobRunModelDef.create({ job: JOB, date: period, sent: count, finishedAt: new Date() }),
    send: sendMonthlySummaryEmail,
    log: logWithSource,
  };
}

function startMonthlySummaryJob() {
  const cron = require("node-cron");
  const run = () => createMonthlySummary(createDeps())().catch((err) => console.error("[monthlySummary] run failed:", err?.message || err));
  // Hourly: the 1st from 08:00, or the first tick after a server that was down.
  cron.schedule("5 * * * *", run, { timezone: TIME_ZONE });
  setTimeout(run, 2 * 60 * 1000).unref?.();
}

module.exports = { buildMonthlySummary, createMonthlySummary, previousPeriod, startMonthlySummaryJob, MANY_ABSENCES, FIRST_PERIOD };
