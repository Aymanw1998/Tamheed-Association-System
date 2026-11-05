const { canonicalGrade, nextGrade } = require("../utils/grades");

// Every July 1st (Israel time) each student moves up one class.
// Starts in 2027: without this, the first deploy after a July 1st would move
// everyone at once for a date that already passed.
const FIRST_YEAR = 2027;
const JOB = "grade-promotion";
const TIME_ZONE = "Asia/Jerusalem";

function israelDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type).value;
  return { year: Number(pick("year")), date: `${pick("year")}-${pick("month")}-${pick("day")}` };
}

// A server that was down on the day catches up at its next start or tick, year by
// year if it missed more than one. Safe to repeat: a student is moved once a year
// (gradePromotedYear), and one who joined after the date already has that year's class.
function createGradePromotion({ listStudents, updateStudent, hasFinished, markFinished, announce, now = () => new Date(), log = () => {} }) {
  async function runYear(year) {
    const runDate = `${year}-07-01`;
    const cutoff = new Date(`${runDate}T00:00:00+03:00`).getTime();
    let moved = 0;
    let unread = 0;
    let failed = 0;
    for (const student of await listStudents()) {
      if (Number(student.gradePromotedYear) >= year) continue;
      if (new Date(student.createdAt).getTime() >= cutoff) continue;
      const grade = canonicalGrade(student.layer);
      if (!grade) {
        if (String(student.layer ?? "").trim()) unread += 1;
        continue;
      }
      try {
        await updateStudent(student, { layer: nextGrade(grade), gradePromotedYear: year });
        moved += 1;
      } catch (error) {
        failed += 1;
        log("gradePromotion.student", error);
      }
    }
    // A failed student keeps the run open, so the next tick tries again.
    if (failed) return { moved, unread, failed };
    await markFinished(runDate, { moved, unread });
    await announce({ year, moved, unread });
    return { moved, unread, failed };
  }

  return async function runGradePromotion() {
    const { year, date } = israelDate(now());
    const last = date >= `${year}-07-01` ? year : year - 1;
    const total = { moved: 0, unread: 0, failed: 0 };
    let ran = false;
    for (let each = FIRST_YEAR; each <= last; each += 1) {
      if (await hasFinished(`${each}-07-01`)) continue;
      ran = true;
      const out = await runYear(each);
      total.moved += out.moved;
      total.unread = out.unread;
      total.failed += out.failed;
      // Not the next year before this one is whole.
      if (out.failed) break;
    }
    return ran ? total : { skipped: true };
  };
}

function createDeps() {
  const { StudentModelDef } = require("../Entities/Student/Student.model");
  const { JobRunModelDef } = require("../Entities/Notice/Notice.model");
  const { publishNotice } = require("../Entities/Notice/Notice.service");
  const { notifyChange } = require("./liveHub");
  const { logWithSource } = require("../middleware/logger");
  const { sameVersion, nextStamp } = require("../middleware/lockGuard");
  return {
    listStudents: async () => (await StudentModelDef.get({}))?.result || [],
    updateStudent: async (student, change) => {
      // A new stamp, so a form opened before this cannot save the old class back; and
      // the stamp read, so a save made since is not overwritten (the next tick retries).
      const updated = await StudentModelDef.updateExisting(sameVersion({ _id: String(student._id) }, student), { ...change, updatedAt: nextStamp(student) });
      if (!updated?.result) throw new Error("student changed while moving up");
      notifyChange("student", student._id);
    },
    hasFinished: async (date) => ((await JobRunModelDef.get({ job: JOB, date }))?.result || []).length > 0,
    markFinished: (date, counts) => JobRunModelDef.create({ job: JOB, date, ...counts, finishedAt: new Date() }),
    announce: ({ year, moved, unread }) => publishNotice({
      title: "نقل الطلاب إلى الصف التالي",
      body: `تم نقل ${moved} طالبًا إلى الصف التالي (1.7.${year}).${unread ? ` لم يتغيّر ${unread} لأن الصف المكتوب غير واضح، يُرجى اختياره من القائمة.` : ""}`,
      category: "system",
      severity: unread ? "important" : "info",
      link: "/students",
      dedupKey: `${JOB}:${year}`,
    }),
    log: logWithSource,
  };
}

function startGradePromotionJob() {
  const cron = require("node-cron");
  const run = () => createGradePromotion(createDeps())().catch((error) => console.error("[gradePromotion] run failed:", error?.message || error));
  cron.schedule("20 0 * * *", run, { timezone: TIME_ZONE });
  // A start after a missed night.
  setTimeout(run, 60 * 1000).unref?.();
}

module.exports = { createGradePromotion, startGradePromotionJob, FIRST_YEAR };
