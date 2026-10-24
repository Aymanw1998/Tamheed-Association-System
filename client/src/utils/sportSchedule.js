// Football lessons next to the regular lesson schedule, and the date rule of
// the sport attendance sheet. Days run 1 (Sunday) to 7 (Saturday).

// Sport lessons come from GET /lesson/sport-schedule. They are shown read-only.
export const mergeSchedule = (lessons, sportLessons) => [
  ...(lessons || []),
  ...(sportLessons || []).map((lesson) => ({ ...lesson, readOnly: true })),
];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// Lesson weekday (1 = Sunday) of a "YYYY-MM-DD" date, or null if it is not a real date.
const lessonDayOfYmd = (ymd) => {
  if (!YMD.test(String(ymd || ""))) return null;
  const date = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== ymd) return null;
  return date.getUTCDay() + 1;
};

// Attendance can be taken for today or an earlier date, on the lesson's weekday.
export const attendanceDateAllowed = (date, lessonDay, today) => {
  const day = lessonDayOfYmd(date);
  return day !== null && String(date) <= String(today) && day === Number(lessonDay);
};

// The latest `count` dates (newest first) on the lesson's weekday, up to today.
export const lessonDates = (lessonDay, today, count = 12) => {
  const start = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];
  const dates = [];
  for (let back = 0; dates.length < count && back < count * 7 + 7; back += 1) {
    const d = new Date(start.getTime() - back * 86400000).toISOString().slice(0, 10);
    if (attendanceDateAllowed(d, lessonDay, today)) dates.push(d);
  }
  return dates;
};

// "16:30" from a time field to minutes from midnight (NaN when empty).
export const hhmmToMin = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};

// How a read-only sport lesson is labelled in the general schedule.
export const SYSTEM_TEACHER = "النظام";
export const lessonLabel = (lesson) => (lesson?.readOnly ? `⚽ ${lesson.name}` : lesson?.name);
