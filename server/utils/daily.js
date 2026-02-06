const cron = require("node-cron");
const { runDailyAbsenceJob } = require("../Entities/Attendance/Attendance.controller");

const getDow1to7 = (d = new Date()) => {
  const js = d.getDay(); // 0..6
  return js === 0 ? 1 : js + 1; // Sun=1 ... Sat=7
};

cron.schedule(
  "0 23 59 * *",
  async () => {
    try {
      const now = new Date();
      await runDailyAbsenceJob({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        dow1to7: getDow1to7(now),
      });
    } catch (err) {
      console.error("[dailyAbsence] error:", err);
    }
  },
  { timezone: "Asia/Jerusalem" }
);
