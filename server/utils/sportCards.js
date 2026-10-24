// Pure calculations for the sport player cards: no I/O. Callers load the rows.
const sid = (v) => String(v);

function ageOn(birthDate, now) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < b.getUTCMonth() ||
    (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age < 0 ? null : age;
}

// ---- Lesson-based cards (Tamheed Sport v2). Days: 1 = Sunday .. 7 = Saturday. ----
const ISRAEL_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });
const ISRAEL_CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const israelToday = (now) => ISRAEL_DATE.format(now);

const dayOfDate = (date) => new Date(date + "T00:00:00Z").getUTCDay() + 1;

function attendanceSummary({ studentId, lessons, records }) {
  const joinedDate = new Map();
  for (const l of lessons || []) {
    const p = (l.players || []).find((x) => sid(x.studentId) === sid(studentId));
    if (p) joinedDate.set(sid(l._id), p.joinedAt ? israelToday(new Date(p.joinedAt)) : "");
  }
  let present = 0;
  let absent = 0;
  let late = 0;
  for (const r of records || []) {
    if (sid(r.studentId) !== sid(studentId)) continue;
    const from = joinedDate.get(sid(r.sportLessonId));
    if (from === undefined || r.date < from) continue;
    if (r.status === "حاضر") present += 1;
    else if (r.status === "متأخر") late += 1;
    else if (r.status === "غائب") absent += 1;
  }
  const total = present + absent + late;
  return { rate: total === 0 ? null : Math.round((100 * (present + late)) / total), present, absent, late };
}

function nextLesson(lessons, now) {
  const day = dayOfDate(israelToday(now));
  const [h, m] = ISRAEL_CLOCK.format(now).split(":").map(Number);
  const nowMin = h * 60 + m;
  const WEEK = 7 * 1440;
  let best = null;
  for (const l of lessons || []) {
    const d = l.date || {};
    let wait = ((d.day - day + 7) % 7) * 1440 + d.startMin - nowMin;
    if (wait < 0) wait += WEEK;
    if (!best || wait < best.wait) best = { wait, l };
  }
  if (!best) return null;
  const { day: d, startMin, endMin } = best.l.date;
  return { name: best.l.name, day: d, startMin, endMin };
}

function buildCard({ player, sport, lessons, records }) {
  const statDefs = sport.stats || [];
  const given = player.stats || {};
  return {
    jerseyNumber: player.jerseyNumber ?? null,
    position: player.position || "",
    statDefs,
    values: Object.fromEntries(statDefs.map((s) => [s.key, Number(given[s.key]) || 0])),
    attendance: attendanceSummary({ studentId: player.studentId, lessons, records }),
  };
}

module.exports = { ageOn, israelToday, dayOfDate, attendanceSummary, nextLesson, buildCard };
