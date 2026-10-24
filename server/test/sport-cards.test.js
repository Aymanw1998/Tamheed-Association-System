const test = require("node:test");
const assert = require("node:assert/strict");
const { ageOn, attendancePercent, buildCards, nextTraining, israelToday, dayOfDate, attendanceSummary, nextLesson, buildCard } = require("../utils/sportCards");

const NOW = new Date("2026-06-10T12:00:00Z");
const day = (n) => new Date(NOW.getTime() + n * 86400000);

test("ageOn counts whole years and gives null for bad dates", () => {
  assert.equal(ageOn("2015-06-10", new Date("2026-06-09")), 10);
  assert.equal(ageOn("2015-06-10", new Date("2026-06-10")), 11);
  assert.equal(ageOn(null, NOW), null);
  assert.equal(ageOn("garbage", NOW), null);
  assert.equal(ageOn("2030-01-01", NOW), null);
});

test("attendancePercent counts only recorded past trainings after joining", () => {
  const trainings = [
    { startsAt: day(1), recorded: true, presentIds: ["s1"] },
    { startsAt: day(-1), recorded: false, presentIds: [] },
    { startsAt: day(-10), recorded: true, presentIds: [] },
    { startsAt: day(-2), recorded: true, presentIds: ["s1"] },
  ];
  assert.equal(attendancePercent(trainings, "s1", day(-5), NOW), 100);
});

test("attendancePercent returns null when nothing counts", () => {
  assert.equal(attendancePercent([], "s1", null, NOW), null);
});

const sports = [
  { _id: "sp1", name: "كرة القدم", icon: "⚽", stats: [{ key: "s_aaaaaaaa", label: "أهداف" }, { key: "s_bbbbbbbb", label: "تمريرات" }] },
];

test("buildCards makes one card per sport and pools two teams of the same sport", () => {
  const teams = [
    { _id: "t1", name: "الفريق أ", sportId: "sp1", members: [{ studentId: "s1", joinedAt: day(-30) }] },
    { _id: "t2", name: "الفريق ب", sportId: "sp1", members: [{ studentId: "s1", joinedAt: day(-30) }] },
  ];
  const tr = (teamId, n, present) => ({ teamId, sportId: "sp1", startsAt: day(n), recorded: true, presentIds: present ? ["s1"] : [] });
  const trainings = [tr("t1", -3, true), tr("t1", -2, true), tr("t2", -3, true), tr("t2", -2, false)];
  const players = [{ studentId: "s1", sportId: "sp1", jerseyNumber: 7, position: "مهاجم" }];
  const cards = buildCards({ players, sports, teams, trainings, studentId: "s1", now: NOW });
  assert.equal(cards.length, 1);
  const c = cards[0];
  assert.deepEqual(c.sport, { id: "sp1", name: "كرة القدم", icon: "⚽", stats: sports[0].stats });
  assert.equal(c.jerseyNumber, 7);
  assert.equal(c.position, "مهاجم");
  assert.deepEqual(c.teams.map((t) => t.name), ["الفريق أ", "الفريق ب"]);
  assert.equal(c.stats.attendance, 75);
  assert.equal(c.stats.matches, 0);
  assert.deepEqual(c.stats.values, { s_aaaaaaaa: 0, s_bbbbbbbb: 0 });
});

test("buildCards skips a player row whose sport was deleted", () => {
  const players = [{ studentId: "s1", sportId: "gone", jerseyNumber: null, position: "" }];
  assert.deepEqual(buildCards({ players, sports, teams: [], trainings: [], studentId: "s1", now: NOW }), []);
});

test("nextTraining picks the earliest future training of the student's teams", () => {
  const teams = [
    { _id: "t1", name: "الفريق أ", sportId: "sp1", members: [{ studentId: "s1", joinedAt: day(-30) }] },
    { _id: "t2", name: "الفريق ب", sportId: "sp1", members: [{ studentId: "other", joinedAt: day(-30) }] },
  ];
  const trainings = [
    { teamId: "t1", startsAt: day(5), place: "الملعب" },
    { teamId: "t1", startsAt: day(2), place: "القاعة" },
    { teamId: "t2", startsAt: day(1), place: "ملعب آخر" },
    { teamId: "t1", startsAt: day(-1), place: "قديم" },
  ];
  const next = nextTraining({ teams, trainings, sports, studentId: "s1", now: NOW });
  assert.deepEqual(next, { teamName: "الفريق أ", sportName: "كرة القدم", sportIcon: "⚽", startsAt: day(2), place: "القاعة" });
  assert.equal(nextTraining({ teams, trainings: [trainings[3]], sports, studentId: "s1", now: NOW }), null);
});

test("israelToday gives the Israel calendar date", () => {
  assert.equal(israelToday(new Date("2026-10-24T22:30:00Z")), "2026-10-25");
});

test("dayOfDate gives 1 for Sunday up to 7 for Saturday", () => {
  assert.equal(dayOfDate("2026-10-25"), 1);
  assert.equal(dayOfDate("2026-10-31"), 7);
});

const rec = (sportLessonId, date, status, studentId = "s1") => ({ sportLessonId, studentId, date, status });
const joined = (id, at) => ({ _id: id, players: [{ studentId: "s1", joinedAt: new Date(at) }] });

test("attendanceSummary counts records from each lesson join date", () => {
  const lessons = [joined("A", "2026-10-01T09:00:00Z"), joined("B", "2026-10-20T09:00:00Z")];
  const records = [
    rec("A", "2026-10-04", "حاضر"), rec("A", "2026-10-11", "متأخر"), rec("A", "2026-10-18", "غائب"),
    rec("B", "2026-10-13", "غائب"), rec("B", "2026-10-22", "حاضر"),
  ];
  assert.deepEqual(attendanceSummary({ studentId: "s1", lessons, records }), { rate: 75, present: 2, absent: 1, late: 1 });
});

test("attendanceSummary ignores lessons the student left and other students", () => {
  const lessons = [{ _id: "A", players: [] }, joined("B", "2026-10-01T09:00:00Z")];
  const records = [rec("A", "2026-10-04", "حاضر"), rec("B", "2026-10-04", "حاضر", "other")];
  assert.deepEqual(attendanceSummary({ studentId: "s1", lessons, records }), { rate: null, present: 0, absent: 0, late: 0 });
});

test("attendanceSummary has a null rate without records", () => {
  assert.equal(attendanceSummary({ studentId: "s1", lessons: [joined("A", "2026-10-01T09:00:00Z")], records: [] }).rate, null);
});

test("nextLesson finds the next weekly occurrence in Israel time", () => {
  const lessons = [
    { name: "أحد", date: { day: 1, startMin: 1020, endMin: 1080 } },
    { name: "أربعاء", date: { day: 4, startMin: 1020, endMin: 1080 } },
  ];
  // 2026-10-25 is the Israel DST change day: 16:00 is UTC+2 after 02:00.
  assert.deepEqual(nextLesson(lessons, new Date("2026-10-25T14:00:00Z")), { name: "أحد", day: 1, startMin: 1020, endMin: 1080 });
  assert.deepEqual(nextLesson(lessons, new Date("2026-10-25T16:00:00Z")), { name: "أربعاء", day: 4, startMin: 1020, endMin: 1080 });
  assert.equal(nextLesson([], new Date()), null);
});

test("buildCard keeps only the sport stats and defaults missing values to 0", () => {
  const sport = { stats: [{ key: "g", label: "أهداف" }, { key: "a", label: "تمريرات" }] };
  const player = { jerseyNumber: 7, position: "مهاجم", stats: { g: 3, old: 9 } };
  const c = buildCard({ player, sport, lessons: [], records: [] });
  assert.deepEqual(c.values, { g: 3, a: 0 });
  assert.equal(c.jerseyNumber, 7);
  assert.equal(c.position, "مهاجم");
  assert.deepEqual(c.statDefs, sport.stats);
  assert.equal(c.attendance.rate, null);
});
