// Adds made-up sport data to try the sport site, or removes exactly that data.
//
//   node scripts/seedSportDemo.js --email=you@example.com   add the demo data
//   node scripts/seedSportDemo.js --remove                  remove all of it
//
// Everything it creates is marked so --remove finds it and nothing else:
// sports whose name ends with DEMO_MARK, and students whose last name is
// DEMO_MARK with a tz that starts with DEMO_TZ_PREFIX. The --email address goes
// on one demo student only, so you can sign in to the sport site as that student.
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "config", ".env") });

const mongoose = require("mongoose");
const { StudentModelDef } = require("../Entities/Student/Student.model");
const { SportModelDef } = require("../Entities/Sport/Sport.model");
const { SportTeamModelDef } = require("../Entities/Sport/SportTeam.model");
const { SportPlayerModelDef } = require("../Entities/Sport/SportPlayer.model");
const { SportTrainingModelDef } = require("../Entities/Sport/SportTraining.model");
const { SportLoginCodeModelDef } = require("../Entities/Sport/SportLoginCode.model");

const DEMO_MARK = "تجريبي";
const DEMO_TZ_PREFIX = "99990";
const DAY = 24 * 60 * 60 * 1000;

const SPORTS = [
  {
    name: `كرة القدم ${DEMO_MARK}`, icon: "⚽",
    stats: ["أهداف", "تمريرات حاسمة", "مباريات كاملة"],
    positions: ["حارس", "مدافع", "وسط", "مهاجم"],
    teams: ["أشبال تمهيد", "نجوم الرملة"],
  },
  {
    name: `كرة السلة ${DEMO_MARK}`, icon: "🏀",
    stats: ["نقاط", "متابعات", "تمريرات", "رميات ثلاثية"],
    positions: ["صانع ألعاب", "جناح", "لاعب ارتكاز"],
    teams: ["صقور تمهيد"],
  },
  {
    name: `كرة الطائرة ${DEMO_MARK}`, icon: "🏐",
    stats: ["إرسال ناجح", "صدّات"],
    positions: ["معدّ", "ضارب", "ليبرو"],
    teams: ["فريق الطائرة"],
  },
];

const FIRST_NAMES = [
  "يوسف", "آدم", "محمد", "عمر", "كريم", "سامي", "رامي", "ليث", "زيد", "أمير",
  "مريم", "لين", "سلمى", "جنى", "رهف", "تالا", "نور", "ريم", "دانة", "سارة",
];
const PLACES = ["الملعب البلدي", "قاعة المدرسة", "ملعب الحي"];

const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
const statKey = (i) => `s_demo${i}`;

const arg = (name) => {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};

async function findDemo() {
  const sports = rows(await SportModelDef.get({})).filter((s) => String(s.name || "").endsWith(DEMO_MARK));
  const sportIds = sports.map((s) => String(s._id));
  const students = rows(await StudentModelDef.get({ lastname: DEMO_MARK }))
    .filter((s) => String(s.tz || "").startsWith(DEMO_TZ_PREFIX));
  const studentIds = students.map((s) => String(s._id));
  return { sports, sportIds, students, studentIds };
}

async function remove() {
  const { sportIds, studentIds } = await findDemo();
  const counts = {
    trainings: (await SportTrainingModelDef.delete({ sportId: { $in: sportIds } }))?.result?.deletedCount || 0,
    teams: (await SportTeamModelDef.delete({ sportId: { $in: sportIds } }))?.result?.deletedCount || 0,
    players: (await SportPlayerModelDef.delete({ $or: [{ sportId: { $in: sportIds } }, { studentId: { $in: studentIds } }] }))?.result?.deletedCount || 0,
    loginCodes: (await SportLoginCodeModelDef.delete({ studentId: { $in: studentIds } }))?.result?.deletedCount || 0,
    sports: (await SportModelDef.delete({ _id: { $in: sportIds } }))?.result?.deletedCount || 0,
    students: (await StudentModelDef.delete({ _id: { $in: studentIds } }))?.result?.deletedCount || 0,
  };
  console.log("Demo sport data removed:");
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
  if (existing.sports.length || existing.students.length) {
    throw new Error("Demo data already exists. Run with --remove first.");
  }

  const now = new Date();
  const taken = new Set();
  const names = shuffle(FIRST_NAMES);
  const students = [];
  for (let i = 0; i < 16; i += 1) {
    const firstname = names[i % names.length];
    const age = between(9, 15);
    const created = await StudentModelDef.create({
      tz: await freeTz(taken),
      firstname,
      lastname: DEMO_MARK,
      birth_date: new Date(now.getFullYear() - age, between(0, 11), between(1, 28)),
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

  let teamCount = 0;
  let trainingCount = 0;
  let playerCount = 0;
  for (const def of SPORTS) {
    const sport = (await SportModelDef.create({
      name: def.name,
      icon: def.icon,
      stats: def.stats.map((label, i) => ({ key: statKey(i + 1), label })),
    })).result;
    const sportId = String(sport._id);

    // The signed-in demo student plays every sport; the others get a random share.
    const roster = [me, ...shuffle(students.slice(1)).slice(0, between(6, 9))];
    const jerseys = shuffle(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const [i, s] of roster.entries()) {
      await SportPlayerModelDef.create({
        studentId: String(s._id),
        sportId,
        jerseyNumber: i === roster.length - 1 ? null : jerseys[i],
        position: pick(def.positions),
      });
      playerCount += 1;
    }

    // Split the roster across the sport's teams; the demo student is in the first.
    const perTeam = Math.ceil(roster.length / def.teams.length);
    for (const [t, teamName] of def.teams.entries()) {
      const teamRoster = roster.slice(t * perTeam, (t + 1) * perTeam);
      if (t > 0 && !teamRoster.length) continue;
      const joinedAt = new Date(now.getTime() - 45 * DAY);
      const team = (await SportTeamModelDef.create({
        name: teamName,
        sportId,
        coachIds: [],
        members: teamRoster.map((s) => ({ studentId: String(s._id), joinedAt })),
      })).result;
      teamCount += 1;

      // Eight past trainings with attendance, then one upcoming at 17:00.
      for (let k = 8; k >= 1; k -= 1) {
        const startsAt = new Date(now.getTime() - k * 4 * DAY);
        startsAt.setHours(17, 0, 0, 0);
        const presentIds = teamRoster.filter(() => Math.random() < 0.8).map((s) => String(s._id));
        await SportTrainingModelDef.create({
          teamId: String(team._id), sportId, startsAt, place: pick(PLACES), presentIds, recorded: true,
        });
        trainingCount += 1;
      }
      const next = new Date(now.getTime() + between(1, 3) * DAY);
      next.setHours(17, 0, 0, 0);
      await SportTrainingModelDef.create({
        teamId: String(team._id), sportId, startsAt: next, place: pick(PLACES), presentIds: [], recorded: false,
      });
      trainingCount += 1;
    }
  }

  console.log("Demo sport data added:");
  console.table({ students: students.length, sports: SPORTS.length, teams: teamCount, players: playerCount, trainings: trainingCount });
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
