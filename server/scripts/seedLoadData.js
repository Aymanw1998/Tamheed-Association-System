const path = require("path");
const dotenv = require("dotenv");
const { faker } = require("@faker-js/faker");

dotenv.config({ path: path.join(__dirname, "..", "config", ".env") });

const { UserModelDef } = require("../Entities/User/User.model");
const { StudentModelDef } = require("../Entities/Student/Student.model");
const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
const { ReportModelDef } = require("../Entities/Report/Report.model");
const { AttendanceModelDef } = require("../Entities/Attendance/Attendance.model");
const { InviteTokenModelDef } = require("../Entities/InviteToken/InviteToken.model");

const parseArgs = () => {
  const defaults = {
    admins: 2,
    teachers: 6,
    helpers: 4,
    waitingUsers: 3,
    inactiveUsers: 3,
    students: 60,
    lessons: 24,
    reports: 18,
    inviteTokens: 10,
    attendanceDays: 5,
  };

  return process.argv.slice(2).reduce((acc, arg) => {
    const [rawKey, rawValue] = arg.replace(/^--/, "").split("=");
    if (!rawKey || rawValue == null) return acc;
    const value = Number(rawValue);
    acc[rawKey] = Number.isFinite(value) ? value : rawValue;
    return acc;
  }, defaults);
};

const config = parseArgs();
const runId = Date.now();

const seeded = {
  activeUsers: [],
  waitingUsers: [],
  inactiveUsers: [],
  students: [],
  lessons: [],
  reports: [],
  attendances: 0,
  inviteTokens: [],
};

const randomFrom = (list) => list[Math.floor(Math.random() * list.length)];

const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);

const takeRandom = (list, min, max) => {
  if (!list.length) return [];
  const amount = faker.number.int({ min, max: Math.min(max, list.length) });
  return shuffle(list).slice(0, amount);
};

const buildTz = (namespace, index) => {
  const seed = `${namespace}${runId}${String(index).padStart(3, "0")}`.replace(/\D/g, "");
  return seed.slice(-9).padStart(9, "0");
};

const buildPhone = () => `05${faker.string.numeric(8)}`;

const createUserPayload = (role, index) => {
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  const tz = buildTz(role, index);
  return {
    tz,
    firstname: `Seed${first}`,
    lastname: last,
    birth_date: faker.date.birthdate({ min: 20, max: 55, mode: "age" }),
    gender: faker.helpers.arrayElement(["ذكر", "انثى"]),
    phone: buildPhone(),
    email: `seed.${role}.${runId}.${index}@tamheed.local`,
    city: "الرملة",
    street: faker.location.streetAddress(),
    password: "123456",
    roles: [role],
    storageFolder: tz,
    storagePermissions: { view: [], create: [], update: [], delete: [] },
  };
};

const createStudentPayload = (teacher, index) => {
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  return {
    tz: buildTz("student", index),
    firstname: `Seed${first}`,
    lastname: last,
    birth_date: faker.date.birthdate({ min: 8, max: 18, mode: "age" }),
    gender: faker.helpers.arrayElement(["ذكر", "انثى"]),
    phone: buildPhone(),
    email: `seed.student.${runId}.${index}@tamheed.local`,
    city: "الرملة",
    street: faker.location.streetAddress(),
    father_name: faker.person.fullName({ sex: "male" }),
    mother_name: faker.person.fullName({ sex: "female" }),
    father_phone: buildPhone(),
    mother_phone: buildPhone(),
    father_work: faker.person.jobTitle(),
    mother_work: faker.person.jobTitle(),
    school: faker.helpers.arrayElement(["Tamheed School", "Ramlah School", "Future School"]),
    layer: faker.helpers.arrayElement(["3", "4", "5", "6", "7", "8", "9"]),
    health_status: faker.helpers.arrayElement(["جيد", "حساسية بسيطة", "يحتاج متابعة"]),
    notes: faker.helpers.arrayElement(["", "طالب مجتهد", "يحتاج دعم بالقراءة"]),
    main_teacher: teacher?._id || null,
    source: faker.helpers.arrayElement(["جمعية", "اهل"]),
    status: faker.helpers.arrayElement(["عادي", "ينتظر"]),
  };
};

const buildLessonPayload = (teachers, helpers, students, index) => {
  const teacher = randomFrom(teachers);
  const helper = helpers.length ? randomFrom(helpers) : null;
  const enrolled = takeRandom(students, 6, 12).map((student) => String(student._id));
  const startHour = faker.helpers.arrayElement([8, 9, 10, 11, 13, 14, 15, 16, 17]);
  const duration = faker.helpers.arrayElement([45, 60, 90]);
  return {
    name: `SEED Lesson ${String(index + 1).padStart(3, "0")}`,
    date: {
      day: faker.number.int({ min: 1, max: 7 }),
      startMin: startHour * 60,
      endMin: startHour * 60 + duration,
    },
    teacher: String(teacher?._id || ""),
    helper: helper?._id ? String(helper._id) : null,
    list_students: enrolled,
    room: String(faker.number.int({ min: 1, max: 6 })),
  };
};

const buildReportPayload = (users, index) => {
  const author = randomFrom(users);
  const attendance = takeRandom(users, 1, Math.min(5, users.length)).map((user) => String(user._id));
  return {
    date: faker.date.recent({ days: 45 }),
    attendance,
    title: takeRandom(
      [
        "تقرير عام",
        "تقرير جمعية",
        "نشاط طلاب",
        "اجتماع اداري",
        "متابعة شهرية",
      ],
      1,
      3
    ),
    stitle: `SEED Report ${String(index + 1).padStart(3, "0")}`,
    info: faker.lorem.paragraphs({ min: 2, max: 4 }, "\n\n"),
    createdBy: String(author?._id || ""),
  };
};

const buildAttendancePayload = (lesson, student, dateOffset) => {
  const base = new Date();
  base.setDate(base.getDate() - dateOffset);
  const day = base.getDate();
  const month = base.getMonth() + 1;
  const year = base.getFullYear();
  return {
    lesson: String(lesson._id),
    student: String(student._id),
    dateKey: Number(`${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`),
    status: faker.helpers.arrayElement(["حاضر", "غائب", "متأخر"]),
    day,
    month,
    year,
    notes: faker.helpers.arrayElement(["", "وصل متأخرا", "غياب بعذر"]),
  };
};

const buildInviteTokenPayload = (index) => ({
  token: `seed-invite-${runId}-${index}-${faker.string.alphanumeric(16)}`,
  expiresAt: faker.date.soon({ days: 14 }),
  used: faker.datatype.boolean({ probability: 0.15 }),
});

const fetchAll = async () => {
  const [activeUsersRes, waitingUsersRes, inactiveUsersRes, studentsRes, lessonsRes, reportsRes] =
    await Promise.all([
      UserModelDef.get({}, "active"),
      UserModelDef.get({}, "waiting"),
      UserModelDef.get({}, "noActive"),
      StudentModelDef.get({}),
      LessonModelDef.get({}),
      ReportModelDef.get({}),
    ]);

  return {
    activeUsers: activeUsersRes?.result || [],
    waitingUsers: waitingUsersRes?.result || [],
    inactiveUsers: inactiveUsersRes?.result || [],
    students: studentsRes?.result || [],
    lessons: lessonsRes?.result || [],
    reports: reportsRes?.result || [],
  };
};

const createUsers = async () => {
  const createGroup = async (count, role, room, bucket) => {
    for (let index = 0; index < count; index += 1) {
      const payload = createUserPayload(role, index);
      await UserModelDef.create(payload, room);
      bucket.push(payload.tz);
    }
  };

  await createGroup(config.admins, "ادارة", "active", seeded.activeUsers);
  await createGroup(config.teachers, "مرشد", "active", seeded.activeUsers);
  await createGroup(config.helpers, "مساعد", "active", seeded.activeUsers);
  await createGroup(config.waitingUsers, "مرشد", "waiting", seeded.waitingUsers);
  await createGroup(config.inactiveUsers, "مساعد", "noActive", seeded.inactiveUsers);
};

const createStudents = async (teachers) => {
  for (let index = 0; index < config.students; index += 1) {
    const payload = createStudentPayload(randomFrom(teachers), index);
    await StudentModelDef.create(payload);
    seeded.students.push(payload.tz);
  }
};

const createLessons = async (teachers, helpers, students) => {
  for (let index = 0; index < config.lessons; index += 1) {
    const payload = buildLessonPayload(teachers, helpers, students, index);
    await LessonModelDef.create(payload);
    seeded.lessons.push(payload.name);
  }
};

const createReports = async (users) => {
  for (let index = 0; index < config.reports; index += 1) {
    const payload = buildReportPayload(users, index);
    await ReportModelDef.create(payload);
    seeded.reports.push(payload.stitle);
  }
};

const createAttendances = async (lessons, students) => {
  for (const lesson of lessons) {
    const lessonStudents = (lesson.list_students || [])
      .map((studentId) => students.find((student) => String(student._id) === String(studentId)))
      .filter(Boolean);

    if (!lessonStudents.length) continue;

    for (let offset = 0; offset < config.attendanceDays; offset += 1) {
      for (const student of lessonStudents) {
        await AttendanceModelDef.create(buildAttendancePayload(lesson, student, offset));
        seeded.attendances += 1;
      }
    }
  }
};

const createInviteTokens = async () => {
  for (let index = 0; index < config.inviteTokens; index += 1) {
    const payload = buildInviteTokenPayload(index);
    await InviteTokenModelDef.create(payload);
    seeded.inviteTokens.push(payload.token);
  }
};

const main = async () => {
  console.log("Starting data seed/load with config:", config);

  await createUsers();
  const collectionsAfterUsers = await fetchAll();
  const activeSeedUsers = collectionsAfterUsers.activeUsers.filter((user) => seeded.activeUsers.includes(user.tz));
  const teacherUsers = activeSeedUsers.filter((user) => (user.roles || []).includes("مرشد"));
  const helperUsers = activeSeedUsers.filter((user) => (user.roles || []).includes("مساعد"));

  await createStudents(teacherUsers);
  const collectionsAfterStudents = await fetchAll();
  const seedStudents = collectionsAfterStudents.students.filter((student) => seeded.students.includes(student.tz));

  await createLessons(teacherUsers, helperUsers, seedStudents);
  const collectionsAfterLessons = await fetchAll();
  const seedLessons = collectionsAfterLessons.lessons.filter((lesson) => seeded.lessons.includes(lesson.name));

  await createReports(activeSeedUsers);
  await createInviteTokens();
  await createAttendances(seedLessons, seedStudents);

  console.log("Seed completed successfully.");
  console.table({
    activeUsers: seeded.activeUsers.length,
    waitingUsers: seeded.waitingUsers.length,
    inactiveUsers: seeded.inactiveUsers.length,
    students: seeded.students.length,
    lessons: seeded.lessons.length,
    reports: seeded.reports.length,
    inviteTokens: seeded.inviteTokens.length,
    attendances: seeded.attendances,
  });
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
