// Training reminders to sport players, about an hour before the lesson.
// Every 5 minutes (Asia/Jerusalem) it finds today's sport lessons that start
// 55-60 minutes from now and pushes «تدريبك اليوم الساعة HH:MM» to their
// players. The windows of consecutive ticks overlap, so each lesson takes a
// JobRuns lock (unique lockKey sport-reminder:<lessonId>:<date>) first: one
// reminder per lesson per day, even across processes.
const cron = require("node-cron");
const { jerusalemClock, acquireLock } = require("./alertJob");

const TIME_ZONE = "Asia/Jerusalem";
const FROM_MIN = 55;
const TO_MIN = 60;
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

function createDeps() {
  const { SportLessonModelDef } = require("../Entities/Sport/SportLesson.model");
  const { logWithSource } = require("../middleware/logger");
  return {
    listSportLessons: async () => (await SportLessonModelDef.get({}))?.result || [],
    acquireLock,
    sendToStudents: (...args) => require("../utils/push").push.sendToStudents(...args),
    log: (...args) => logWithSource("[sportPushJob]", ...args),
  };
}

async function runReminderSlot(deps = createDeps(), now = new Date()) {
  const clock = jerusalemClock(now);
  let sent = 0;
  for (const lesson of (await deps.listSportLessons()) || []) {
    const ahead = Number(lesson?.date?.startMin) - clock.minutes;
    if (Number(lesson?.date?.day) !== clock.dow || !(ahead >= FROM_MIN && ahead <= TO_MIN)) continue;
    const playerIds = [...new Set((lesson.players || []).map((p) => String(p?.studentId || "")).filter(Boolean))];
    if (!playerIds.length) continue;
    try {
      if (!(await deps.acquireLock(`sport-reminder:${lesson._id}:${clock.date}`, clock))) continue;
      await deps.sendToStudents(playerIds, {
        title: "تمهيد - رياضة", body: `تدريبك اليوم الساعة ${hhmm(lesson.date.startMin)}`, url: "/",
      });
      sent += 1;
    } catch (error) {
      deps.log?.("reminder failed", error?.message || error);
    }
  }
  return { sent };
}

function startSportPushJob() {
  cron.schedule("*/5 * * * *", () =>
    runReminderSlot().catch((err) => console.error("[sportPushJob] run failed:", err?.message || err)), { timezone: TIME_ZONE });
}

module.exports = { runReminderSlot, startSportPushJob };
