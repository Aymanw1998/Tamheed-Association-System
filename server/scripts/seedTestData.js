// Fills a LOCAL test database with linked data for trying the system, or removes
// exactly that data.
//
//   node scripts/seedTestData.js            add the test data
//   node scripts/seedTestData.js --remove   remove all of it
//
// It adds 10 admins, 10 guides and 10 assistants (plus 3 waiting and 2 inactive
// users), 160 students, 50 lessons with attendance for the last 3 weeks, 15
// reports, and 2 football lessons with players and attendance.
//
// The links are shaped to cover every case of the record pages:
//   - guides 1-7 have students and lessons, guide 8 has students but no lessons,
//     guides 9-10 have neither (their profile shows no tabs);
//   - 16 students have no responsible guide, some of them in lessons;
//   - some students are in no lesson.
//
// Every seeded user signs in with SEED_PASSWORD from config/.env; when it is
// missing, one is made and written there (the file is git-ignored).
// Marks: users and students have an email at @seed.tamheed.local; lessons,
// sport lessons and reports have updatedBy "seed-test-data"; attendance and
// players are found through them. Football itself is never deleted.
//
// It refuses a database that is not on this computer (localhost/127.0.0.1).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

const ENV_FILE = path.join(__dirname, "..", "config", ".env");
dotenv.config({ path: ENV_FILE });

const mongoose = require("mongoose");
const { UserModelDef } = require("../Entities/User/User.model");
const { StudentModelDef } = require("../Entities/Student/Student.model");
const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
const { ReportModelDef } = require("../Entities/Report/Report.model");
const { AttendanceModelDef } = require("../Entities/Attendance/Attendance.model");
const { SportLessonModelDef } = require("../Entities/Sport/SportLesson.model");
const { SportAttendanceModelDef } = require("../Entities/Sport/SportAttendance.model");
const { SportPlayerModelDef } = require("../Entities/Sport/SportPlayer.model");
const { SportModelDef } = require("../Entities/Sport/Sport.model");
const { ensureFootball } = require("../Entities/Sport/Sport.controller");

const MARK = "seed-test-data";
const EMAIL_DOMAIN = "seed.tamheed.local";
const EMAIL_FILTER = { email: { $regex: `@${EMAIL_DOMAIN.replace(/\./g, "\\.")}$` } };
const ROOMS = ["active", "waiting", "noActive"];
const DAY = 24 * 60 * 60 * 1000;

const MALE = ["محمد", "أحمد", "يوسف", "عمر", "خالد", "سامي", "رامي", "كريم", "علي", "حسن",
  "إبراهيم", "آدم", "زيد", "ليث", "مالك", "طارق", "نادر", "وسيم", "فادي", "جاد"];
const FEMALE = ["مريم", "سارة", "نور", "ليان", "رهف", "جنى", "سلمى", "تالا", "ريم", "دانة",
  "هبة", "رنا", "لينا", "آية", "ياسمين", "ملك", "شهد", "لمى", "غدير", "أمل"];
const FAMILIES = ["أبو صالح", "حداد", "خطيب", "منصور", "عودة", "نصار", "شاهين", "سلامة", "زعبي",
  "عيسى", "قاسم", "يونس", "حمدان", "دراوشة", "مصاروة", "جبارين", "عثامنة", "بكري"];
const STREETS = ["شارع الجامع", "شارع هرتسل", "حي الجواريش", "شارع الزيتون", "حي المحطة", "البلدة القديمة"];
const SUBJECTS = ["رياضيات", "لغة عربية", "لغة إنجليزية", "علوم", "لغة عبرية",
  "قراءة", "حاسوب", "فنون", "تقوية دراسية", "مهارات حياتية"];
const GRADES = ["الثالث", "الرابع", "الخامس", "السادس", "السابع"];
const SPORT_LESSONS = [
  { name: "كرة قدم - أشبال", day: 2, startMin: 17 * 60, endMin: 18 * 60 + 30 },
  { name: "كرة قدم - ناشئين", day: 4, startMin: 18 * 60, endMin: 19 * 60 + 30 },
];
const STATS = [
  { key: "s_goals", label: "أهداف" },
  { key: "s_assists", label: "تمريرات حاسمة" },
  { key: "s_games", label: "مباريات" },
];
const POSITIONS = ["حارس", "مدافع", "وسط", "مهاجم"];

const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const deleted = (res) => res?.result?.deletedCount || 0;
const pick = (list, i) => list[i % list.length];
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
const phone = () => `05${rand(0, 8)}${String(rand(0, 9999999)).padStart(7, "0")}`;

// A valid Israeli ID: 8 digits and their check digit.
function israeliTz(n) {
  const base = String(n).padStart(8, "0").slice(-8);
  const sum = base.split("").reduce((acc, d, i) => {
    const v = Number(d) * (i % 2 === 0 ? 1 : 2);
    return acc + (v > 9 ? v - 9 : v);
  }, 0);
  return `${base}${(10 - (sum % 10)) % 10}`;
}

function assertLocal() {
  const uri = String(process.env.MONGO_URI || "");
  const host = (uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/:,?]+)/) || [])[1] || "";
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`MONGO_URI points to "${host || "nothing"}", not this computer. This script only fills a local test database.`);
  }
  return uri;
}

function seedPassword() {
  const current = String(process.env.SEED_PASSWORD || "").trim();
  if (current) return { password: current, made: false };
  const password = `Seed-${crypto.randomBytes(4).toString("hex")}`;
  const text = fs.readFileSync(ENV_FILE, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  fs.appendFileSync(ENV_FILE, `${text.endsWith("\n") ? "" : eol}${eol}# Password of every user made by scripts/seedTestData.js (local test data only).${eol}SEED_PASSWORD=${password}${eol}`);
  return { password, made: true };
}

async function findSeed() {
  const users = (await Promise.all(ROOMS.map((room) => UserModelDef.get(EMAIL_FILTER, room)))).flatMap(rows);
  const students = rows(await StudentModelDef.get(EMAIL_FILTER));
  const lessons = rows(await LessonModelDef.get({ updatedBy: MARK }));
  const sportLessons = rows(await SportLessonModelDef.get({ updatedBy: MARK }));
  const reports = rows(await ReportModelDef.get({ updatedBy: MARK }));
  return { users, students, lessons, sportLessons, reports };
}

async function remove() {
  const found = await findSeed();
  const ids = (list) => list.map((d) => String(d._id));
  const studentIds = ids(found.students);
  const counts = {
    attendance: deleted(await AttendanceModelDef.delete({ lesson: { $in: ids(found.lessons) } })),
    sportAttendance: deleted(await SportAttendanceModelDef.delete({ sportLessonId: { $in: ids(found.sportLessons) } })),
    sportPlayers: deleted(await SportPlayerModelDef.delete({ studentId: { $in: studentIds } })),
    sportLessons: deleted(await SportLessonModelDef.delete({ updatedBy: MARK })),
    lessons: deleted(await LessonModelDef.delete({ updatedBy: MARK })),
    reports: deleted(await ReportModelDef.delete({ updatedBy: MARK })),
    students: deleted(await StudentModelDef.delete(EMAIL_FILTER)),
    users: 0,
  };
  for (const room of ROOMS) counts.users += deleted(await UserModelDef.delete(EMAIL_FILTER, room));
  console.log("Test data removed (football itself is kept):");
  console.table(counts);
}

// "YYYY-MM-DD" of the latest past date (before today) on lesson day `day` (1 = Sunday).
function pastDates(day, weeks) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  do d.setTime(d.getTime() - DAY); while (d.getDay() + 1 !== day);
  return Array.from({ length: weeks }, (_, w) => new Date(d.getTime() - w * 7 * DAY));
}
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const status = () => { const r = Math.random(); return r < 0.75 ? "حاضر" : r < 0.87 ? "متأخر" : "غائب"; };

async function seed(password) {
  const existing = await findSeed();
  if (Object.values(existing).some((list) => list.length)) {
    throw new Error("Test data already exists. Run with --remove first.");
  }
  const now = new Date();
  let tzSeed = 77000000;
  const nextTz = () => israeliTz(tzSeed++);

  // --- users ---
  const makeUser = async (role, index, room, label) => {
    const female = index % 3 === 2;
    const tz = nextTz();
    const data = {
      tz,
      password,
      firstname: pick(female ? FEMALE : MALE, index * 7 + role.length),
      lastname: pick(FAMILIES, index * 5 + label.length),
      birth_date: new Date(Date.UTC(now.getFullYear() - rand(24, 55), rand(0, 11), rand(1, 28))),
      gender: female ? "أنثى" : "ذكر",
      phone: phone(),
      email: `${label}${index + 1}@${EMAIL_DOMAIN}`,
      city: "الرملة",
      street: pick(STREETS, index),
      roles: [role],
      storageFolder: tz,
      storagePermissions: { view: [], create: [], update: [], delete: [] },
      passwordChangedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await UserModelDef.create(data, room);
    return rows(await UserModelDef.get({ tz }, room))[0];
  };
  const admins = [];
  const guides = [];
  const helpers = [];
  for (let i = 0; i < 10; i += 1) admins.push(await makeUser("ادارة", i, "active", "admin"));
  for (let i = 0; i < 10; i += 1) guides.push(await makeUser("مرشد", i, "active", "guide"));
  for (let i = 0; i < 10; i += 1) helpers.push(await makeUser("مساعد", i, "active", "helper"));
  for (let i = 0; i < 3; i += 1) await makeUser("مرشد", i, "waiting", "waiting");
  for (let i = 0; i < 2; i += 1) await makeUser("مساعد", i, "noActive", "inactive");

  // --- students: 18 for each of guides 1-8, 16 with no guide ---
  const students = [];
  for (let i = 0; i < 160; i += 1) {
    const guide = i < 144 ? guides[Math.floor(i / 18)] : null;
    const female = i % 2 === 1;
    const family = pick(FAMILIES, i * 3);
    const created = await StudentModelDef.create({
      tz: nextTz(),
      firstname: pick(female ? FEMALE : MALE, i),
      lastname: family,
      birth_date: new Date(Date.UTC(now.getFullYear() - rand(8, 13), rand(0, 11), rand(1, 28))),
      gender: female ? "أنثى" : "ذكر",
      phone: i % 4 === 0 ? phone() : "",
      email: `student${i + 1}@${EMAIL_DOMAIN}`,
      city: "الرملة",
      street: pick(STREETS, i),
      father_name: `${pick(MALE, i + 3)} ${family}`,
      mother_name: `${pick(FEMALE, i + 5)} ${pick(FAMILIES, i + 1)}`,
      father_phone: phone(),
      mother_phone: phone(),
      father_work: pick(["معلم", "سائق", "مهندس", "تاجر", "عامل بناء", "ممرض"], i),
      mother_work: pick(["ربة بيت", "معلمة", "ممرضة", "موظفة", "خياطة"], i),
      school: pick(["مدرسة الرملة الابتدائية", "مدرسة الجواريش", "مدرسة النهضة", "مدرسة المستقبل"], i),
      layer: pick(["3", "4", "5", "6", "7"], i),
      health_status: pick(["جيد", "جيد", "جيد", "حساسية بسيطة", "يحتاج متابعة"], i),
      notes: pick(["", "", "طالب مجتهد", "يحتاج دعم بالقراءة", "يحب الرياضة"], i),
      main_teacher: guide ? String(guide._id) : null,
      source: i % 3 === 0 ? "اهل" : "جمعية",
      status: i % 15 === 14 ? "ينتظر" : "عادي",
      createdAt: now,
      updatedAt: now,
    });
    students.push(created.result);
  }
  const byGuide = (g) => students.filter((s) => s.main_teacher === String(g._id));
  const noGuide = students.filter((s) => !s.main_teacher);

  // --- 50 lessons: Sun-Thu, 14:00 and 15:30, rooms 1-6; no room, guide,
  // assistant or student is in two lessons at once. Guides 1-7 teach. ---
  const lessons = [];
  for (let i = 0; i < 50; i += 1) {
    const room = (i % 6) + 1;
    const startMin = Math.floor(i / 6) % 2 === 0 ? 14 * 60 : 15 * 60 + 30;
    const day = Math.floor(i / 12) + 1;
    const teacher = guides[i % 7];
    const helper = i % 5 === 4 ? null : helpers[i % 10];
    const pool = shuffle(byGuide(teacher)).slice(0, rand(5, 10));
    // A few students with no guide sit in lessons too.
    if (i % 4 === 0) pool.push(noGuide[(i / 4) % 8]);
    const created = await LessonModelDef.create({
      name: `${SUBJECTS[i % 10]} - الصف ${GRADES[Math.floor(i / 10)]}`,
      date: { day, startMin, endMin: startMin + 75 },
      teacher: String(teacher._id),
      helper: helper ? String(helper._id) : null,
      list_students: [...new Set(pool.map((s) => String(s._id)))],
      room: String(room),
      updatedBy: MARK,
      updatedByName: "بيانات تجريبية",
      createdAt: now,
      updatedAt: now,
    });
    lessons.push(created.result);
  }

  // --- attendance: the last 3 weeks of every lesson ---
  let attendance = 0;
  for (const lesson of lessons) {
    for (const d of pastDates(lesson.date.day, 3)) {
      for (const studentId of lesson.list_students) {
        const [year, month, day] = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
        await AttendanceModelDef.create({
          lesson: String(lesson._id),
          student: studentId,
          dateKey: Number(`${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`),
          status: status(),
          day,
          month,
          year,
          notes: "",
          updatedBy: MARK,
          createdAt: now,
          updatedAt: now,
        });
        attendance += 1;
      }
    }
  }

  // --- 15 reports ---
  const titles = ["تقرير عام", "تقرير جمعية", "نشاط طلاب", "اجتماع اداري", "متابعة شهرية"];
  for (let i = 0; i < 15; i += 1) {
    const author = pick([...admins, ...guides], i * 3);
    await ReportModelDef.create({
      date: new Date(now.getTime() - rand(1, 45) * DAY),
      attendance: shuffle([...admins, ...guides, ...helpers]).slice(0, rand(2, 6)).map((u) => String(u._id)),
      title: [pick(titles, i)],
      stitle: `${pick(titles, i)} رقم ${i + 1}`,
      info: "تقرير تجريبي: تمت متابعة الطلاب ومراجعة الحضور، ونوقشت خطة الأسبوع القادم.",
      createdBy: String(author._id),
      updatedBy: MARK,
      createdAt: now,
      updatedAt: now,
    });
  }

  // --- 2 football lessons with players and 4 weeks of attendance ---
  const football = await ensureFootball();
  const sportId = String(football._id);
  let stats = football.stats || [];
  if (!stats.length) {
    await SportModelDef.updateExisting({ _id: football._id }, { stats: STATS, updatedAt: now });
    stats = STATS;
  }
  const players = shuffle(students.filter((s) => s.gender === "ذكر")).slice(0, 24);
  const members = [players.slice(0, 14), players.slice(10, 24)];
  const joinedAt = new Date(now.getTime() - 6 * 7 * DAY);
  let sportAttendance = 0;
  for (const [l, def] of SPORT_LESSONS.entries()) {
    const lesson = (await SportLessonModelDef.create({
      sportId,
      name: def.name,
      date: { day: def.day, startMin: def.startMin, endMin: def.endMin },
      room: "9",
      players: members[l].map((s) => ({ studentId: String(s._id), joinedAt })),
      updatedBy: MARK,
      updatedByName: "بيانات تجريبية",
      createdAt: now,
      updatedAt: now,
    })).result;
    for (const d of pastDates(def.day, 4)) {
      for (const s of members[l]) {
        await SportAttendanceModelDef.create({
          sportLessonId: String(lesson._id), studentId: String(s._id), date: isoDate(d), status: status(),
          updatedBy: MARK, createdAt: now, updatedAt: now,
        });
        sportAttendance += 1;
      }
    }
  }
  const jerseys = shuffle(Array.from({ length: 30 }, (_, i) => i + 1));
  for (const [i, s] of players.entries()) {
    await SportPlayerModelDef.create({
      studentId: String(s._id),
      sportId,
      jerseyNumber: jerseys[i],
      position: pick(POSITIONS, i),
      stats: Object.fromEntries(stats.map((st) => [st.key, rand(0, 20)])),
    });
  }

  console.log("Test data added:");
  console.table({
    admins: admins.length, guides: guides.length, assistants: helpers.length, waitingUsers: 3, inactiveUsers: 2,
    students: students.length, lessons: lessons.length, attendance, reports: 15,
    sportLessons: SPORT_LESSONS.length, sportPlayers: players.length, sportAttendance,
  });
  const show = (u) => `${u.tz}  ${u.firstname} ${u.lastname}`;
  console.log("\nSign-in IDs (password: SEED_PASSWORD in config/.env):");
  console.log(`  admin                          ${show(admins[0])}`);
  console.log(`  guide with students + lessons  ${show(guides[0])}`);
  console.log(`  guide with students only       ${show(guides[7])}`);
  console.log(`  guide with nothing             ${show(guides[9])}`);
  console.log(`  assistant                      ${show(helpers[0])}`);
}

async function main() {
  assertLocal();
  if (process.argv.includes("--remove")) return remove();
  const { password, made } = seedPassword();
  if (made) console.log("SEED_PASSWORD was missing; a new one was written to config/.env.");
  return seed(password);
}

main()
  .then(async () => { await mongoose.disconnect().catch(() => {}); process.exit(0); })
  .catch(async (error) => {
    console.error("Failed:", error.message || error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
