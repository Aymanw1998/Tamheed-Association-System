// Lesson days run 1 (Sunday) to 7 (Saturday).
export const DAY_NAMES = ["الاحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const startOf = (lesson) => lesson?.date?.startMin ?? (lesson?.date?.hh ?? 8) * 60;
export const endOf = (lesson) => lesson?.date?.endMin ?? startOf(lesson) + 45;

export const toHHMM = (min) => {
  const m = Math.max(0, Math.min(min ?? 0, 24 * 60));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const lessonsForDay = (lessons, day) =>
  (lessons || [])
    .filter((lesson) => lesson?.date && Number(lesson.date.day) === Number(day))
    .sort((a, b) => startOf(a) - startOf(b));

export const countLessonsByDay = (lessons) => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const lesson of lessons || []) {
    const day = Number(lesson?.date?.day);
    if (day >= 1 && day <= 7) counts[day - 1] += 1;
  }
  return counts;
};

export const lessonDayOf = (date = new Date()) => date.getDay() + 1;
