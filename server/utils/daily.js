const cron = require("node-cron");
const { runDailyAbsenceJob } = require("../Entities/Attendance/Attendance.controller");
const { logWithSource } = require("../middleware/logger");

const getDow1to7 = (d = new Date()) => {
  const js = d.getDay(); // 0..6
  return js === 0 ? 1 : js + 1; // Sun=1 ... Sat=7
};

function startDailyAbsenceJob() {
  // Runs every day at 23:59 (Asia/Jerusalem). Marks any student on a lesson
  // scheduled for that weekday who has no attendance row yet as absent.
  cron.schedule(
    "59 23 * * *",
    async () => {
      try {
        const now = new Date();
        const result = await runDailyAbsenceJob({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          dow1to7: getDow1to7(now),
        });
        logWithSource("[dailyAbsence] done", result);
      } catch (err) {
        logWithSource("[dailyAbsence] error", err);
      }
    },
    { timezone: "Asia/Jerusalem" }
  );

  logWithSource("[dailyAbsence] scheduled for 23:59 Asia/Jerusalem");
}

module.exports = { startDailyAbsenceJob, getDow1to7 };
