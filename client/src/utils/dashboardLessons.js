import { endOf, lessonDayOf, lessonsForDay, startOf } from "./lessonSchedule";

// What the dashboard's lessons panel shows at `now`:
// - today: every lesson today (so attendance can still be taken after it
//   ends), each marked "done", "now", "next" (the first one still ahead) or "later".
// - upcoming: when nothing is left today, the nearest following day that has
//   lessons, wrapping around the week. Null otherwise.
// Admins see every lesson; others only lessons they teach or help in.
export const dashboardLessons = (lessons, now, { isAdmin, userId } = {}) => {
  const mine = isAdmin
    ? lessons || []
    : (lessons || []).filter(
        (lesson) => String(lesson.teacher) === String(userId) || String(lesson.helper) === String(userId)
      );

  const todayDay = lessonDayOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let nextMarked = false;

  const today = lessonsForDay(mine, todayDay).map((lesson) => {
    let state = "later";
    if (endOf(lesson) <= nowMin) state = "done";
    else if (startOf(lesson) <= nowMin) state = "now";
    else if (!nextMarked) {
      state = "next";
      nextMarked = true;
    }
    return { lesson, state };
  });

  const anythingLeft = today.some((item) => item.state !== "done");
  if (anythingLeft) return { today, upcoming: null };

  for (let offset = 1; offset <= 7; offset += 1) {
    const day = ((todayDay - 1 + offset) % 7) + 1;
    const dayLessons = lessonsForDay(mine, day);
    if (dayLessons.length) {
      if (day === todayDay) break;
      return { today, upcoming: { day, lessons: dayLessons } };
    }
  }
  return { today, upcoming: null };
};
