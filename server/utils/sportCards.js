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

module.exports = { ageOn, attendancePercent, buildCards, nextTraining };
