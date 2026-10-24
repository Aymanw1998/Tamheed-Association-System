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

// A training counts when it is recorded, already started, and not before joining.
function countsFor(t, joinedAt, now) {
  const at = new Date(t.startsAt).getTime();
  if (t.recorded !== true || at > now.getTime()) return false;
  return !joinedAt || at >= new Date(joinedAt).getTime();
}

const wasPresent = (t, studentId) => (t.presentIds || []).some((id) => sid(id) === sid(studentId));

function attendancePercent(trainings, studentId, joinedAt, now) {
  const counted = trainings.filter((t) => countsFor(t, joinedAt, now));
  if (counted.length === 0) return null;
  return Math.round((100 * counted.filter((t) => wasPresent(t, studentId)).length) / counted.length);
}

const memberOf = (team, studentId) =>
  (team.members || []).find((m) => sid(m.studentId) === sid(studentId));

function buildCards({ players, sports, teams, trainings, studentId, now }) {
  const sportById = new Map(sports.map((s) => [sid(s._id), s]));
  const cards = [];
  for (const p of players) {
    const sport = sportById.get(sid(p.sportId));
    if (!sport) continue;
    const myTeams = teams.filter((t) => sid(t.sportId) === sid(sport._id) && memberOf(t, studentId));
    // Pool across the student's teams; each team counts from its own joinedAt.
    let counted = 0;
    let present = 0;
    for (const t of myTeams) {
      const joinedAt = memberOf(t, studentId).joinedAt;
      const rows = trainings.filter((tr) => sid(tr.teamId) === sid(t._id) && countsFor(tr, joinedAt, now));
      counted += rows.length;
      present += rows.filter((tr) => wasPresent(tr, studentId)).length;
    }
    const stats = sport.stats || [];
    cards.push({
      sport: { id: sid(sport._id), name: sport.name, icon: sport.icon, stats },
      jerseyNumber: p.jerseyNumber ?? null,
      position: p.position || "",
      teams: myTeams.map((t) => ({ id: sid(t._id), name: t.name })),
      stats: {
        matches: 0,
        attendance: counted === 0 ? null : Math.round((100 * present) / counted),
        values: Object.fromEntries(stats.map((s) => [s.key, 0])),
      },
    });
  }
  return cards.sort((a, b) => a.sport.name.localeCompare(b.sport.name, "ar"));
}

function nextTraining({ teams, trainings, sports, studentId, now }) {
  const mine = new Map(teams.filter((t) => memberOf(t, studentId)).map((t) => [sid(t._id), t]));
  let best = null;
  for (const tr of trainings) {
    const team = mine.get(sid(tr.teamId));
    if (!team || new Date(tr.startsAt).getTime() <= now.getTime()) continue;
    if (!best || new Date(tr.startsAt) < new Date(best.tr.startsAt)) best = { tr, team };
  }
  if (!best) return null;
  const sport = sports.find((s) => sid(s._id) === sid(best.team.sportId));
  return {
    teamName: best.team.name,
    sportName: sport ? sport.name : "",
    sportIcon: sport ? sport.icon : "",
    startsAt: best.tr.startsAt,
    place: best.tr.place || "",
  };
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

module.exports = { ageOn, attendancePercent, buildCards, nextTraining, israelToday, dayOfDate, attendanceSummary, nextLesson, buildCard };
