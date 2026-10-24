// Adds made-up football data to try the sport site, or removes exactly that data.
//
//   node scripts/seedSportDemo.js --email=you@example.com   add the demo data
//   node scripts/seedSportDemo.js --remove                  remove all of it
//
// Everything it creates is marked so --remove finds it and nothing else:
// students whose last name is DEMO_MARK with a tz that starts with DEMO_TZ_PREFIX,
// the lessons that hold only them (by demo lesson name), and their players and
// attendance. The --email address goes on one demo student only, so you can sign
// in to the sport site as that student. Football itself is the real sport
// (ensureFootball) and is never deleted; its stats are set only when it has none.
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "config", ".env") });

const mongoose = require("mongoose");
const { StudentModelDef } = require("../Entities/Student/Student.model");
const { SportLessonModelDef } = require("../Entities/Sport/SportLesson.model");
const { SportAttendanceModelDef } = require("../Entities/Sport/SportAttendance.model");
const { SportPlayerModelDef } = require("../Entities/Sport/SportPlayer.model");
const { SportModelDef } = require("../Entities/Sport/Sport.model");
const { SportLoginCodeModelDef } = require("../Entities/Sport/SportLoginCode.model");
const { ensureFootball } = require("../Entities/Sport/Sport.controller");
const { dayOfDate, israelToday } = require("../utils/sportCards");

const DEMO_MARK = "تجريبي";
const DEMO_TZ_PREFIX = "99990";
const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 6;

const STATS = [
  { key: "s_demo1", label: "أهداف" },
  { key: "s_demo2", label: "تمريرات حاسمة" },
  { key: "s_demo3", label: "مباريات" },
];
const POSITIONS = ["حارس", "مدافع", "وسط", "مهاجم"];
// day: 1 = الأحد .. 7 = السبت; times are minutes from midnight.
const LESSONS = [
  { name: "أشبال الأحد", day: 1, startMin: 17 * 60, endMin: 18 * 60 + 30 },
  { name: "نجوم الثلاثاء", day: 3, startMin: 18 * 60, endMin: 19 * 60 },
  { name: "أشبال الأربعاء", day: 4, startMin: 17 * 60, endMin: 18 * 60 + 30 },
];
const FIRST_NAMES = [
  "يوسف", "آدم", "محمد", "عمر", "كريم", "سامي", "رامي", "ليث", "زيد", "أمير",
  "مريم", "لين", "سلمى", "جنى", "رهف", "تالا", "نور", "ريم", "دانة", "سارة",
];

const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
const deleted = (res) => res?.result?.deletedCount || 0;

const arg = (name) => {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};

// "YYYY-MM-DD" plus n days, with no time zone involved.
const addDays = (date, n) => new Date(new Date(date + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);

// The latest date strictly before `today` that falls on `day` (1 = الأحد).
function lastWeekday(today, day) {
  let d = addDays(today, -1);
  while (dayOfDate(d) !== day) d = addDays(d, -1);
  return d;
}

async function findDemo() {
  const students = rows(await StudentModelDef.get({ lastname: DEMO_MARK }))
    .filter((s) => String(s.tz || "").startsWith(DEMO_TZ_PREFIX));
  const studentIds = students.map((s) => String(s._id));
  // A lesson is demo data when it has a demo lesson name and only demo students in it.
  const names = new Set(LESSONS.map((l) => l.name));
  const lessons = studentIds.length
    ? rows(await SportLessonModelDef.get({ "players.studentId": { $in: studentIds } }))
      .filter((l) => names.has(l.name) && (l.players || []).every((p) => studentIds.includes(String(p.studentId))))
    : [];
  return { students, studentIds, lessons, lessonIds: lessons.map((l) => String(l._id)) };
}

async function remove() {
  const { studentIds, lessonIds } = await findDemo();
  const counts = {
    attendance: deleted(await SportAttendanceModelDef.delete({ $or: [{ sportLessonId: { $in: lessonIds } }, { studentId: { $in: studentIds } }] })),
    lessons: deleted(await SportLessonModelDef.delete({ _id: { $in: lessonIds } })),
    players: deleted(await SportPlayerModelDef.delete({ studentId: { $in: studentIds } })),
    loginCodes: deleted(await SportLoginCodeModelDef.delete({ studentId: { $in: studentIds } })),
    students: deleted(await StudentModelDef.delete({ _id: { $in: studentIds } })),
  };
  console.log("Demo sport data removed (football itself is kept):");
  console.table(counts);
}

async function freeTz(taken) {
  for (;;) {
    const tz = `${DEMO_TZ_PREFIX}${String(between(0, 9999)).padStart(4, "0")}`;
    if (taken.has(tz)) continue;
    if (rows(await StudentModelDef.get({ tz })).length) continue;
    taken.add(tz);
    return tz;
  }
}

async function seed(email) {
  const existing = await findDemo();
  if (existing.lessons.length || existing.students.length) {
    throw new Error("Demo data already exists. Run with --remove first.");
  }

  const now = new Date();
  const football = await ensureFootball();
  const sportId = String(football._id);
  let stats = football.stats || [];
  if (!stats.length) {
    await SportModelDef.updateExisting({ _id: football._id }, { stats: STATS, updatedAt: now });
    stats = STATS;
  }

  const taken = new Set();
  const names = shuffle(FIRST_NAMES);
  const students = [];
  for (let i = 0; i < 16; i += 1) {
    const age = between(9, 15);
    const created = await StudentModelDef.create({
      tz: await freeTz(taken),
      firstname: names[i % names.length],
      lastname: DEMO_MARK,
      birth_date: new Date(Date.UTC(now.getFullYear() - age, between(0, 11), between(1, 28))),
      gender: i % 2 === 0 ? "ذكر" : "أنثى",
      email: i === 0 ? email : "",
      notes: "طالب تجريبي لموقع الرياضة. يُحذف مع: node scripts/seedSportDemo.js --remove",
      source: "جمعية",
      status: "عادي",
      createdAt: now,
      updatedAt: now,
    });
    students.push(created.result);
  }
  const me = students[0];

  // Each student is in 1-2 lessons; the signed-in demo student is in the first two.
  const members = LESSONS.map(() => []);
  students.forEach((s, i) => {
    const first = i === 0 ? 0 : i % LESSONS.length;
    const picked = new Set([first]);
    if (i === 0) picked.add(1);
    else if (Math.random() < 0.4) picked.add((first + 1 + between(0, LESSONS.length - 2)) % LESSONS.length);
    picked.forEach((l) => members[l].push(s));
  });

  // Members count from joinedAt, so it is before the first seeded week.
  const joinedAt = new Date(now.getTime() - (WEEKS + 2) * 7 * DAY);
  const today = israelToday(now);
  let attendanceCount = 0;
  const seen = new Set();
  for (const [l, def] of LESSONS.entries()) {
    const lesson = (await SportLessonModelDef.create({
      sportId,
      name: def.name,
      date: { day: def.day, startMin: def.startMin, endMin: def.endMin },
      room: "9",
      players: members[l].map((s) => ({ studentId: String(s._id), joinedAt })),
      createdAt: now,
      updatedAt: now,
    })).result;

    const latest = lastWeekday(today, def.day);
    for (let w = 0; w < WEEKS; w += 1) {
      const date = addDays(latest, -7 * w);
      for (const s of members[l]) {
        let status;
        const roll = Math.random();
        // The sign-in student gets all three statuses in their first lesson.
        if (s === me && l === 0 && w < 3) status = ["حاضر", "غائب", "متأخر"][w];
        else status = roll < 0.7 ? "حاضر" : roll < 0.8 ? "متأخر" : "غائب";
        await SportAttendanceModelDef.create({
          sportLessonId: String(lesson._id), studentId: String(s._id), date, status, createdAt: now, updatedAt: now,
        });
        seen.add(status);
        attendanceCount += 1;
      }
    }
  }

  // Every demo student plays; the last one has no jersey number yet.
  const jerseys = shuffle(Array.from({ length: 30 }, (_, i) => i + 1));
  for (const [i, s] of students.entries()) {
    await SportPlayerModelDef.create({
      studentId: String(s._id),
      sportId,
      jerseyNumber: i === students.length - 1 ? null : jerseys[i],
      position: pick(POSITIONS),
      stats: Object.fromEntries(stats.map((d) => [d.key, between(0, 25)])),
    });
  }

  console.log("Demo sport data added:");
  console.table({ students: students.length, lessons: LESSONS.length, players: students.length, attendance: attendanceCount });
  console.log(`Statuses seeded: ${[...seen].join(", ")}`);
  console.log(`Sign in to the sport site with ID number ${me.tz}${email ? "; the code goes to the email you gave." : " (no --email given, so no code can be sent)."}`);
}

async function main() {
  if (arg("remove")) return remove();
  const email = arg("email");
  if (email === true || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Give a valid address: --email=you@example.com");
  }
  return seed(email || "");
}

main()
  .then(async () => { await mongoose.disconnect().catch(() => {}); process.exit(0); })
  .catch(async (error) => {
    console.error("Failed:", error.message || error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
