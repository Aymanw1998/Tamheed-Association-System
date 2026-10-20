const { scopeLesson } = require("../../../utils/studentScope");
const { FORBIDDEN, invalid, jerusalemDate, addDays, daysBetween, weekdayOf, hhmm, rows } = require("./_shared");

const MAX_DAYS = 7;

// Lessons repeat weekly (date.day 1-7, Sunday = 1). Any lessons.view holder
// sees every lesson, like GET /api/lessons; the students inside are cut to
// the user's scope with scopeLesson (shared with the Lesson controller), and only
// counts leave this tool. The user's own lessons come first.
module.exports = {
  name: "list_lessons",
  description: "Lessons on a date, or on each date of a range of up to 7 days (lessons repeat weekly). Without dates: today. "
    + "Each lesson: id, name, start, end, room, teacher, helper, students (how many the user may see), totalStudents, "
    + "and mine (the user teaches or helps). The user's own lessons are listed first.",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", format: "date", description: "One day, YYYY-MM-DD." },
      from: { type: "string", format: "date", description: "Range start, YYYY-MM-DD." },
      to: { type: "string", format: "date", description: "Range end, YYYY-MM-DD (at most 7 days after from)." },
    },
    required: [],
    additionalProperties: false,
  },
  async run(input, ctx) {
    if (!ctx.can("lessons.view")) return FORBIDDEN;
    const today = jerusalemDate(ctx.now);
    let dates;
    if (input.date) {
      dates = [input.date];
    } else if (input.from || input.to) {
      const from = input.from || input.to;
      const to = input.to || input.from;
      const span = daysBetween(from, to);
      if (span < 0) return invalid("from must not be after to");
      if (span >= MAX_DAYS) return invalid(`at most ${MAX_DAYS} days`);
      dates = Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
    } else {
      dates = [today];
    }

    const [all, visible, users] = await Promise.all([ctx.models.Lesson.get({}), ctx.visible(), ctx.users()]);
    const me = String(ctx.actor.id ?? "");
    const staffName = (id) => (id == null || id === "" ? null : users.get(String(id))?.name || null);

    const days = dates.map((date) => {
      const day = weekdayOf(date);
      const lessons = rows(all)
        .filter((l) => Number(l?.date?.day) === day)
        .map((l) => {
          const scoped = scopeLesson(l, visible);
          const mine = Boolean(me) && [l.teacher, l.helper].some((v) => v != null && String(v) === me);
          return {
            id: String(l._id),
            name: l.name || "",
            start: hhmm(l?.date?.startMin),
            end: hhmm(l?.date?.endMin),
            room: l.room ?? "",
            teacher: staffName(l.teacher),
            helper: staffName(l.helper),
            students: (scoped.list_students || []).length,
            totalStudents: (l.list_students || []).length,
            mine,
            startMin: Number(l?.date?.startMin) || 0,
          };
        })
        .sort((a, b) => Number(b.mine) - Number(a.mine) || a.startMin - b.startMin)
        .map(({ startMin, ...lesson }) => lesson);
      return { date, weekday: day, lessons };
    });
    return { today, days };
  },
};
