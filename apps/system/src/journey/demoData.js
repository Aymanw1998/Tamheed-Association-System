// The training mode's data. Everything here is invented and lives only in
// memory: names are marked «التجريبي», ID numbers fail the Israeli checksum on
// purpose, phones are 050-000-00NN and emails use example.com, so nothing can
// be mistaken for a real person (the repository is public).
//
// Shapes follow what the server stores and returns, so the screens work as is.

const TIME_ZONE = "Asia/Jerusalem";

const pad = (n, size = 2) => String(n).padStart(size, "0");

export const todayYmd = (now = new Date()) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
};

export const addDays = (ymd, days) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const isoAt = (ymd, hour = 10) => `${ymd}T${pad(hour)}:00:00.000Z`;

// Demo _ids look like Mongo ids (24 hex characters) but start with "dddd".
export const demoId = (kind, n) => `dddd${pad(kind, 4)}${pad(n, 16)}`;

// Nine digits whose last digit is chosen to FAIL the Israeli ID checksum.
const invalidIsraeliId = (eightDigits) => {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let n = Number(eightDigits[i]) * (i % 2 === 0 ? 1 : 2);
    if (n > 9) n -= 9;
    sum += n;
  }
  const valid = (10 - (sum % 10)) % 10;
  return `${eightDigits}${(valid + 1) % 10}`;
};

const phone = (n) => `050-000-00${pad(n)}`;

const LAST = "التجريبي";
const LAST_F = "التجريبية";

function makeUsers(now, me) {
  const base = [
    { n: 1, role: "ادارة", firstname: "سلمى", lastname: LAST_F, gender: "انثى" },
    { n: 2, role: "مرشد", firstname: "يوسف", lastname: LAST, gender: "ذكر" },
    { n: 3, role: "مساعد", firstname: "ريم", lastname: LAST_F, gender: "انثى" },
  ];
  return base.map(({ n, role, firstname, lastname, gender }) => ({
    _id: me.id && me.role === role ? me.id : demoId(1, n),
    tz: invalidIsraeliId(`9990000${n}`),
    firstname,
    lastname,
    gender,
    birth_date: "1990-01-01T00:00:00.000Z",
    phone: phone(n),
    email: `demo.user${n}@example.com`,
    city: "مدينة تجريبية",
    street: "شارع التدريب",
    roles: [role],
    role,
    photo: "",
    room: "active",
    vehiclePermissions: [],
    createdAt: now,
    updatedAt: now,
  }));
}

function makeStudents(now, guideId) {
  const list = [
    { firstname: "آدم", lastname: LAST, gender: "ذكر", status: "عادي", layer: "السابع" },
    { firstname: "ليان", lastname: LAST_F, gender: "انثى", status: "عادي", layer: "الثامن" },
    { firstname: "كريم", lastname: LAST, gender: "ذكر", status: "عادي", layer: "السابع" },
    { firstname: "جود", lastname: LAST_F, gender: "انثى", status: "عادي", layer: "التاسع" },
    { firstname: "سامي", lastname: LAST, gender: "ذكر", status: "ينتظر", layer: "الثامن", source: "اهل" },
    { firstname: "نور", lastname: LAST_F, gender: "انثى", status: "ينتظر", layer: "السابع", source: "اهل" },
  ];
  return list.map((s, i) => ({
    _id: demoId(2, i + 1),
    tz: invalidIsraeliId(`9991000${i + 1}`),
    firstname: s.firstname,
    lastname: s.lastname,
    father_name: "خالد",
    mother_name: "هدى",
    birth_date: "2012-05-01T00:00:00.000Z",
    gender: s.gender,
    phone: phone(10 + i),
    father_phone: phone(30 + i),
    mother_phone: phone(50 + i),
    email: "",
    city: "مدينة تجريبية",
    street: "شارع التدريب",
    photo: "",
    father_work: "",
    mother_work: "",
    school: "مدرسة تجريبية",
    layer: s.layer,
    health_status: "",
    notes: "",
    main_teacher: guideId,
    source: s.source || "جمعية",
    status: s.status,
    createdAt: now,
    updatedAt: now,
  }));
}

// Lesson days are 1 (Sunday) to 7 (Saturday), like the server.
const dayOf = (date) => date.getDay() + 1;
const shiftDay = (day, by) => ((day - 1 + by + 7) % 7) + 1;

function makeLessons(now, nowDate, staff, students) {
  const today = dayOf(nowDate);
  const active = students.filter((s) => s.status === "عادي").map((s) => s._id);
  const plan = [
    { name: "مهارات القيادة", by: 0, start: 16 * 60, end: 17 * 60 + 30, room: "1", roster: active.slice(0, 3) },
    { name: "نشاط رياضي", by: 1, start: 15 * 60, end: 16 * 60, room: "8", roster: active },
    { name: "إسعاف أولي", by: 2, start: 17 * 60, end: 18 * 60, room: "2", roster: active.slice(1, 4) },
    { name: "ورشة فنون", by: 4, start: 16 * 60, end: 17 * 60, room: "3", roster: active.slice(2, 4) },
  ];
  return plan.map((p, i) => ({
    _id: demoId(3, i + 1),
    name: p.name,
    date: { day: shiftDay(today, p.by), startMin: p.start, endMin: p.end },
    teacher: staff.guide,
    helper: staff.assistant,
    list_students: [...p.roster],
    room: p.room,
    num_in_list: p.roster.length,
    createdAt: now,
    updatedAt: now,
  }));
}

// The most recent date (today or earlier) that falls on a lesson's weekday.
const lastOccurrence = (lessonDay, todayStr, todayDay) => addDays(todayStr, -((todayDay - lessonDay + 7) % 7));

function makeAttendance(lessons, todayStr, todayDay) {
  const statuses = ["حاضر", "حاضر", "غائب", "متأخر"];
  const rows = [];
  lessons.forEach((lesson) => {
    const ymd = lastOccurrence(lesson.date.day, todayStr, todayDay);
    const [year, month, day] = ymd.split("-").map(Number);
    lesson.list_students.forEach((student, i) => {
      rows.push({
        lesson: lesson._id,
        student,
        dateKey: year * 10000 + month * 100 + day,
        year,
        month,
        day,
        status: statuses[i % statuses.length],
        notes: "",
      });
    });
  });
  return rows;
}

// The file the guide «chooses» in the files chapter: built in memory, so the
// real file picker never opens. Uploading it writes only to the demo store.
export const DEMO_UPLOAD_NAME = "خطة-الأسبوع.pdf";
export const demoUploadFile = () => new File(["demo"], DEMO_UPLOAD_NAME, { type: "application/pdf" });

export function createDemoStore({ meId = null, meTz = null, role = null, permissions = [], isSystem = false } = {}) {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const today = todayYmd(nowDate);
  // The signed-in user's own permissions decide what the permissions tab may grant.
  const me = {
    id: meId ? String(meId) : null,
    tz: meTz ? String(meTz) : null,
    role,
    permissions: Array.isArray(permissions) ? permissions.filter((key) => typeof key === "string") : [],
    isSystem: isSystem === true,
  };

  const users = makeUsers(now, me);
  const [admin, guide, assistant] = users;
  // New accounts waiting for approval: the dashboard chapter approves one and
  // the users chapter the other, so each still has one when run alone.
  [
    { n: 4, firstname: "هادي", lastname: LAST, gender: "ذكر" },
    { n: 5, firstname: "وفاء", lastname: LAST_F, gender: "انثى" },
  ].forEach(({ n, firstname, lastname, gender }) => users.push({
    ...assistant,
    _id: demoId(1, n),
    tz: invalidIsraeliId(`9990000${n}`),
    firstname,
    lastname,
    gender,
    phone: phone(n),
    email: `demo.user${n}@example.com`,
    roles: [],
    role: null,
    room: "waiting",
  }));
  const students = makeStudents(now, guide._id);
  const lessons = makeLessons(now, nowDate, { guide: guide._id, assistant: assistant._id }, students);
  const attendance = makeAttendance(lessons, today, dayOf(nowDate));
  const name = (u) => `${u.firstname} ${u.lastname}`;

  const reports = [
    {
      _id: demoId(4, 1),
      date: isoAt(addDays(today, -2)),
      title: ["نشاط ميداني"],
      stitle: "جولة تعليمية في الحي",
      info: "<p>شارك الطلاب في جولة تعليمية قصيرة، وتعرّفوا على قواعد السلامة.</p>",
      attendance: [],
      createdBy: guide._id,
      createdAt: isoAt(addDays(today, -2), 15),
      updatedAt: isoAt(addDays(today, -2), 15),
    },
    {
      _id: demoId(4, 2),
      date: isoAt(addDays(today, -6)),
      title: ["لقاء أسبوعي"],
      stitle: "لقاء الأسبوع مع الطلاب",
      info: "<p>ناقش الطلاب أهداف الأسبوع ووزّعوا المهام بينهم.</p>",
      attendance: [],
      createdBy: guide._id,
      createdAt: isoAt(addDays(today, -6), 15),
      updatedAt: isoAt(addDays(today, -6), 15),
    },
  ];

  const vehicleId = demoId(5, 1);
  const vehicles = [
    {
      _id: vehicleId,
      plate: "0000001",
      plateKey: "0000001",
      nickname: "حافلة التدريب",
      type: "vehicle",
      classification: "حافلة صغيرة",
      make: "مثال",
      model: "تجريبي",
      year: 2020,
      color: "أبيض",
      chassisNumber: "DEMO0000000000001",
      registeredOwner: "جمعية تجريبية",
      responsibleId: admin._id,
      status: "active",
      notes: "",
      trailer: { selfWeightKg: "", grossWeightKg: "", payloadKg: "", brakes: "unknown", towingConditions: "" },
      licenses: [
        {
          id: "lic-1",
          validFrom: addDays(today, -355),
          validUntil: addDays(today, 10),
          feeStatus: "paid",
          feeAmount: "",
          feePaidDate: addDays(today, -356),
          recordedAt: isoAt(addDays(today, -355)),
          recordedByName: name(admin),
        },
      ],
      tests: [
        {
          id: "test-1",
          result: "passed",
          testDate: addDays(today, -320),
          retestDate: "",
          nextTestDate: addDays(today, 45),
          recordedAt: isoAt(addDays(today, -320)),
          recordedByName: name(admin),
        },
      ],
      nextTestDate: addDays(today, 45),
      policies: [
        {
          id: "pol-1",
          type: "mandatory",
          insurer: "شركة تأمين تجريبية",
          policyNumber: "DEMO-001",
          startDate: addDays(today, -165),
          endDate: addDays(today, 200),
          recordedAt: isoAt(addDays(today, -165)),
          recordedByName: name(admin),
        },
      ],
      documents: [
        {
          id: "doc-1",
          kind: "license",
          name: "رخصة-تجريبية.pdf",
          title: "رخصة المركبة",
          mimeType: "application/pdf",
          size: 120000,
          linkedType: "license",
          linkedId: "lic-1",
          uploadedAt: isoAt(addDays(today, -355)),
          uploadedByName: name(admin),
          supersededAt: "",
          replacesId: "",
        },
      ],
      createdBy: admin._id,
      createdAt: isoAt(addDays(today, -400)),
      updatedBy: admin._id,
      updatedAt: isoAt(addDays(today, -165)),
    },
  ];

  const vehicleAudit = [
    {
      _id: demoId(6, 1),
      vehicleId,
      plate: "0000001",
      action: "license.add",
      by: admin._id,
      byName: name(admin),
      at: isoAt(addDays(today, -355)),
      changes: [],
      reason: "",
      details: null,
    },
  ];

  const files = [
    { name: "مستندات الدروس (تجريبي)", path: "مستندات الدروس (تجريبي)", isDirectory: true },
    { name: "صور الأنشطة (تجريبي)", path: "صور الأنشطة (تجريبي)", isDirectory: true },
    { name: "جدول-الأنشطة.pdf", path: "جدول-الأنشطة.pdf", size: 240000, mimeType: "application/pdf" },
    { name: "قائمة-الطلاب.xlsx", path: "مستندات الدروس (تجريبي)/قائمة-الطلاب.xlsx", size: 18000, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    { name: "دليل-السلامة.pdf", path: "مستندات الدروس (تجريبي)/دليل-السلامة.pdf", size: 530000, mimeType: "application/pdf" },
    { name: "نشاط-رياضي.jpg", path: "صور الأنشطة (تجريبي)/نشاط-رياضي.jpg", size: 860000, mimeType: "image/jpeg" },
  ].map((file, i) => ({
    ...file,
    filename: file.path,
    isDirectory: Boolean(file.isDirectory),
    size: file.isDirectory ? 0 : file.size,
    modifiedAt: isoAt(addDays(today, -(i + 1))),
    ownerName: name(admin),
  }));

  const notices = [
    {
      _id: demoId(7, 1),
      title: "رخصة «حافلة التدريب» تنتهي قريبًا",
      body: "تنتهي رخصة المركبة خلال 10 أيام. جدّدها قبل موعد الانتهاء.",
      category: "vehicle",
      severity: "important",
      link: `/vehicles/${vehicleId}`,
      createdBy: "system",
      createdByName: "",
      createdAt: isoAt(today, 6),
      read: false,
      archivedAt: null,
    },
    {
      _id: demoId(7, 2),
      title: "اجتماع الطاقم يوم الخميس",
      body: "يُعقد اجتماع الطاقم الأسبوعي يوم الخميس الساعة الخامسة مساءً.",
      category: "manual",
      severity: "info",
      link: "",
      createdBy: admin._id,
      createdByName: name(admin),
      createdAt: isoAt(addDays(today, -1), 9),
      read: false,
      archivedAt: null,
    },
    {
      _id: demoId(7, 3),
      title: "تحديث النظام",
      body: "أُضيفت تحسينات على صفحة الحضور والغياب.",
      category: "system",
      severity: "info",
      link: "",
      createdBy: "system",
      createdByName: "",
      createdAt: isoAt(addDays(today, -4), 9),
      read: true,
      archivedAt: null,
    },
  ];

  const audit = [
    { module: "students", action: "create", targetType: "student", targetId: students[4]._id, targetLabel: name(students[4]), at: isoAt(addDays(today, -1), 11), by: admin },
    { module: "lessons", action: "update", targetType: "lesson", targetId: lessons[0]._id, targetLabel: lessons[0].name, at: isoAt(addDays(today, -2), 12), by: guide, changes: { room: { before: "2", after: "1" } } },
    { module: "attendance", action: "update", targetType: "lesson", targetId: lessons[1]._id, targetLabel: lessons[1].name, at: isoAt(addDays(today, -3), 13), by: assistant },
    { module: "reports", action: "create", targetType: "report", targetId: reports[0]._id, targetLabel: reports[0].stitle, at: isoAt(addDays(today, -2), 15), by: guide },
  ].map(({ by, ...row }, i) => ({
    _id: demoId(8, i + 1),
    actor: by.tz,
    actorName: name(by),
    changes: {},
    ...row,
  }));

  const alerts = [
    { type: "vehicle_license", severity: "important", text: { ar: "رخصة «حافلة التدريب» تنتهي خلال 10 أيام." }, link: `/vehicles/${vehicleId}`, at: isoAt(today, 6), read: false },
    { type: "report_missing", severity: "info", text: { ar: "لم يُكتب تقرير لدرس «نشاط رياضي» بعد." }, link: "/reports", at: isoAt(addDays(today, -1), 18), read: false },
    { type: "lesson_no_attendance", severity: "info", text: { ar: "لم يُسجَّل الحضور والغياب لدرس «إسعاف أولي»." }, link: "/calendar", at: isoAt(addDays(today, -2), 19), read: true },
  ].map((alert, i) => ({ id: demoId(9, i + 1), ...alert }));

  return {
    today,
    me,
    seq: 100,
    users,
    students,
    lessons,
    attendance,
    reports,
    vehicles,
    vehicleAudit,
    files,
    // Who each file or folder is shared with: { path, tz, role, name }.
    shares: [],
    // Chunked uploads in progress, by upload id.
    uploads: {},
    notices,
    audit,
    alerts,
  };
}
