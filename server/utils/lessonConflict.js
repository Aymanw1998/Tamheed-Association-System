// Room 9 («التدريب الخارجي») is shared by regular lessons and football lessons.
// Football lessons have no teacher or helper, only a room.

const overlaps = (a, b) => {
  const x = a?.date;
  const y = b?.date;
  if (!x || !y) return false;
  return Number(x.day) === Number(y.day) && Number(x.startMin) < Number(y.endMin) && Number(y.startMin) < Number(x.endMin);
};

const same = (a, b) => !!a && !!b && String(a) === String(b);

// candidate: { date, room?, teacher?, helper? } (room defaults to "9", a football lesson).
// ignoreId: the lesson being edited, skipped in both lists.
function conflictsInRoom9(candidate, { lessons = [], sportLessons = [], ignoreId = null } = {}) {
  const room = String(candidate?.room ?? "9");
  const skip = (l) => ignoreId != null && String(l?._id) === String(ignoreId);
  const regular = (lessons || []).some((l) => !skip(l) && overlaps(candidate, l)
    && (String(l.room) === room || same(candidate.teacher, l.teacher) || same(candidate.helper, l.helper)));
  if (regular) return true;
  return room === "9" && (sportLessons || []).some((l) => !skip(l) && overlaps(candidate, l));
}

module.exports = { overlaps, conflictsInRoom9 };
