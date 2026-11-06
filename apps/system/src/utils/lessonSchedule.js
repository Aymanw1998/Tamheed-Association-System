// Lesson days run 1 (Sunday) to 7 (Saturday).
export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const PROGRAM_START = 13 * 60;
export const PROGRAM_END = 22 * 60;
export const PROGRAM_HOURS_MESSAGE = "يجب أن يكون موعد البرنامج بين 13:00 و22:00، وأن تكون ساعة الانتهاء بعد ساعة البدء.";
export const validProgramHours = (start, end) => Number.isInteger(start) && Number.isInteger(end) && start >= PROGRAM_START && end <= PROGRAM_END && end > start;
export const initialProgramStart = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && value != null && value !== "" ? Math.max(PROGRAM_START, Math.min(number, PROGRAM_END - 45)) : PROGRAM_START;
};
export const timelinePosition = (minute) => {
  const fraction = (minute - PROGRAM_START) / (PROGRAM_END - PROGRAM_START);
  return `calc(${fraction * 100}% + ${20 - 40 * fraction}px)`;
};
export const timelineDuration = (duration) => {
  const fraction = duration / (PROGRAM_END - PROGRAM_START);
  return `calc(${fraction * 100}% - ${40 * fraction}px)`;
};
export const timelineMinuteAt = (offset, height) => PROGRAM_START + Math.round((offset - 20) / Math.max(1, height - 40) * (PROGRAM_END - PROGRAM_START));

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
