// Answers the app's API requests from the demo store while training mode is on.
// Reads return what the server would return, in the shape each service in
// WebServer/services expects; writes change the store and answer with the
// success shape the screen expects. Anything not listed here returns null
// (the adapter then answers an empty GET or blocks the write).

import { demoId } from "./demoData";

// Requests that still go to the real server during training: the journey's own
// progress (/tours, but not resetting another user's tours), the session
// (refresh, me, logout), the health check, and the signed-in user's own
// vehicle permissions (so no section is shown that the user cannot open).
export const ALLOWED_DURING_DEMO = [
  /^\/tours(?!\/reset)(\/|$)/,
  /^\/auth\/refresh$/,
  /^\/auth\/me$/,
  /^\/auth\/logout$/,
  /^\/health$/,
  /^\/vehicle\/me\/permissions$/,
];

export const DEMO_BLOCKED_MESSAGE = "هذا الإجراء غير متاح في وضع التدريب.";

// "/api/x/y/?a=1" -> { path: "/x/y", query: { a: "1" } }
export function normalizeUrl(url = "") {
  const [rawPath, search = ""] = String(url).split("?");
  let path = rawPath.replace(/^https?:\/\/[^/]+/, "");
  path = path.replace(/^\/api(?=\/|$)/, "");
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  const query = Object.fromEntries(new URLSearchParams(search));
  return { path, query };
}

export const isAllowedDuringDemo = (url) => {
  const { path } = normalizeUrl(url);
  return ALLOWED_DURING_DEMO.some((re) => re.test(path));
};

// ------------------------------------------------------------------ helpers

const readBody = (data) => {
  if (data === undefined || data === null || data === "") return {};
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    const out = {};
    data.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  return typeof data === "object" ? data : {};
};

const nextId = (store, kind) => {
  store.seq += 1;
  return demoId(kind, store.seq);
};

const nowIso = () => new Date().toISOString();
const ok = (data, status = 200) => ({ status, data: { ok: true, ...data } });
const fail = (status, message, extra = {}) => ({ status, data: { ok: false, message, ...extra } });
const notFound = () => fail(404, "غير موجود");
const blocked = () => fail(409, DEMO_BLOCKED_MESSAGE, { code: "DEMO_BLOCKED" });

const fullName = (person) => [person?.firstname, person?.lastname].filter(Boolean).join(" ");
const same = (a, b) => a !== undefined && a !== null && String(a) === String(b);
const byIdOrTz = (list, key) => list.find((item) => same(item._id, key) || same(item.tz, key));

// Who acts in the demo: the demo user with the signed-in user's id or role,
// otherwise the demo administrator.
const actorOf = (store) =>
  store.users.find((u) => same(u._id, store.me?.id)) ||
  store.users.find((u) => u.role === store.me?.role) ||
  store.users[0];

const recordAudit = (store, { module, action, targetType, targetId, targetLabel, changes = {} }) => {
  const actor = actorOf(store);
  store.audit.unshift({
    _id: nextId(store, 8),
    at: nowIso(),
    actor: actor.tz,
    actorName: fullName(actor),
    module,
    action,
    targetType,
    targetId: String(targetId || ""),
    targetLabel: targetLabel || "",
    changes,
  });
};

const diff = (before, after) =>
  Object.keys(after).reduce((out, key) => {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = { before: before[key] ?? null, after: after[key] };
    return out;
  }, {});

// ------------------------------------------------------------------ vehicles
// A small copy of server/utils/vehicleRules.js (summary and alerts), so the
// list and the alerts agree with what the server would compute.

const ALERT_DAYS = [0, 7, 14, 30, 60];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (ymd) => Date.parse(`${ymd}T00:00:00Z`) / 86400000;

const expiryStatus = (dueDate, today) => {
  if (!DATE_ONLY.test(String(dueDate || ""))) return { state: "unknown", daysLeft: null, bucket: null };
  const daysLeft = dayNumber(dueDate) - dayNumber(today);
  if (daysLeft < 0) return { state: "expired", daysLeft, bucket: null };
  const bucket = ALERT_DAYS.find((limit) => daysLeft <= limit) ?? null;
  return { state: bucket === null ? "ok" : "due", daysLeft, bucket };
};

const policyStatus = (policy, today) => {
  if (policy.cancelledAt) return "cancelled";
  if (!DATE_ONLY.test(policy.startDate || "") || !DATE_ONLY.test(policy.endDate || "")) return "incomplete";
  if (policy.endDate < policy.startDate) return "incomplete";
  if (today < policy.startDate) return "future";
  if (today > policy.endDate) return "expired";
  return "active";
};

const latestBy = (list, key) => list.reduce((best, item) => (item[key] > best[key] ? item : best));

const insuranceSummary = (policies, today) => {
  const withStatus = (policies || []).map((policy) => ({ policy, status: policyStatus(policy, today) }));
  const pick = (status) => withStatus.filter((item) => item.status === status).map((item) => item.policy);
  if (pick("active").length) {
    const policy = latestBy(pick("active"), "endDate");
    return { status: "active", endDate: policy.endDate };
  }
  if (pick("future").length) return { status: "future", endDate: "" };
  if (pick("incomplete").length) return { status: "incomplete", endDate: "" };
  if (pick("expired").length) return { status: "expired", endDate: latestBy(pick("expired"), "endDate").endDate };
  if (pick("cancelled").length) return { status: "cancelled", endDate: "" };
  return { status: "none", endDate: "" };
};

const currentLicense = (licenses) => {
  const dated = (licenses || []).filter((r) => !r.voidedAt && DATE_ONLY.test(r.validUntil || ""));
  return dated.length ? latestBy(dated, "validUntil") : null;
};

const effectiveTestDue = (vehicle) => {
  const tests = (vehicle.tests || []).filter((t) => !t.voidedAt);
  const latest = tests.length
    ? tests.reduce((best, t) => (`${t.testDate || ""}|${t.recordedAt || ""}` > `${best.testDate || ""}|${best.recordedAt || ""}` ? t : best))
    : null;
  if (latest && latest.result === "failed" && DATE_ONLY.test(latest.retestDate || "")) {
    return { dueDate: latest.retestDate, source: "retest" };
  }
  return { dueDate: vehicle.nextTestDate || "", source: "official" };
};

const summarizeVehicle = (vehicle, today) => {
  const license = currentLicense(vehicle.licenses);
  const test = effectiveTestDue(vehicle);
  const insurance = insuranceSummary(vehicle.policies, today);
  return {
    license: { validUntil: license?.validUntil || "", ...expiryStatus(license?.validUntil, today) },
    test: { dueDate: test.dueDate, source: test.source, ...expiryStatus(test.dueDate, today) },
    insurance: {
      status: insurance.status,
      endDate: insurance.endDate || "",
      ...(insurance.status === "active"
        ? expiryStatus(insurance.endDate, today)
        : insurance.status === "expired"
          ? { state: "expired", daysLeft: dayNumber(insurance.endDate) - dayNumber(today), bucket: null }
          : { state: "unknown", daysLeft: null, bucket: null }),
    },
  };
};

const buildVehicleAlerts = (vehicle, today) => {
  if (vehicle.status === "archived") return [];
  const summary = summarizeVehicle(vehicle, today);
  const base = { vehicleId: vehicle._id, plate: vehicle.plate, nickname: vehicle.nickname || "", responsibleId: vehicle.responsibleId || "" };
  const alerts = [];
  const push = (kind, dueDate, status, extra = {}) => {
    if (status.state === "ok") return;
    const level = status.state === "expired" ? "expired" : status.state === "due" ? `due${status.bucket}` : "missing";
    alerts.push({ ...base, kind, level, dueDate: dueDate || "", daysLeft: status.daysLeft, key: `${base.vehicleId}:${kind}:${level}:${dueDate || "none"}`, ...extra });
  };
  push("license", summary.license.validUntil, summary.license);
  push("test", summary.test.dueDate, summary.test, { source: summary.test.source });
  if (summary.insurance.status === "active" || summary.insurance.status === "expired") {
    push("insurance", summary.insurance.endDate, summary.insurance);
  } else {
    push("insurance", "", { state: "unknown", daysLeft: null });
  }
  return alerts;
};

const toClientVehicle = (store, vehicle) => {
  const current = currentLicense(vehicle.licenses);
  const responsible = store.users.find((u) => same(u._id, vehicle.responsibleId));
  return {
    ...vehicle,
    licenses: (vehicle.licenses || []).map((r) => ({ ...r, status: r.voidedAt ? "void" : current && r.id === current.id ? "current" : "past" })),
    tests: (vehicle.tests || []).map((r) => ({ ...r, status: r.voidedAt ? "void" : "recorded" })),
    policies: (vehicle.policies || []).map((r) => ({ ...r, status: policyStatus(r, store.today) })),
    responsibleName: responsible ? fullName(responsible) : "",
    summary: summarizeVehicle(vehicle, store.today),
  };
};

const vehicleWrite = (store, vehicle, action, patch = {}, status = 200) => {
  Object.assign(vehicle, patch, { updatedAt: nowIso() });
  const actor = actorOf(store);
  store.vehicleAudit.unshift({
    _id: nextId(store, 6),
    vehicleId: vehicle._id,
    plate: vehicle.plate,
    action,
    by: actor._id,
    byName: fullName(actor),
    at: nowIso(),
    changes: [],
    reason: "",
    details: null,
  });
  recordAudit(store, { module: "vehicles", action: action === "create" ? "create" : "update", targetType: "vehicle", targetId: vehicle._id, targetLabel: vehicle.plate });
  return ok({ changed: true, vehicle: toClientVehicle(store, vehicle) }, status);
};

const RECORD_KINDS = { licenses: "license", tests: "test", policies: "policy" };

const demoDocumentBlob = (doc) =>
  new Blob(
    [`مستند تجريبي: ${doc?.title || doc?.name || ""}\nهذا الملف جزء من وضع التدريب، ولا يحتوي على بيانات حقيقية.`],
    { type: "text/plain;charset=utf-8" }
  );

// ------------------------------------------------------------------ storage

const parentOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const trim = (path) => String(path || "").replace(/^\/+|\/+$/g, "");
const joinPath = (folder, name) => (folder ? `${folder}/${name}` : name);

const withFolderSize = (store, entry) =>
  entry.isDirectory
    ? { ...entry, size: store.files.filter((f) => !f.isDirectory && f.path.startsWith(`${entry.path}/`)).reduce((s, f) => s + (f.size || 0), 0) }
    : entry;

// ------------------------------------------------------------------ routes

const ROUTES = [];
const route = (method, pattern, handler) => ROUTES.push({ method, pattern, handler });

// --- students
route("get", /^\/student$/, (s) => ok({ students: s.students }));
route("get", /^\/student\/lookup\/([^/]+)$/, (s, [tz]) => {
  const student = s.students.find((st) => same(st.tz, tz));
  return student ? ok({ student: { _id: student._id, tz: student.tz, firstname: student.firstname, lastname: student.lastname } }) : notFound();
});
route("get", /^\/student\/([^/]+)$/, (s, [key]) => {
  const student = byIdOrTz(s.students, key);
  return student ? ok({ student }) : notFound();
});
route("post", /^\/student$/, (s, _, { body }) => {
  const now = nowIso();
  const student = { status: "عادي", source: "جمعية", photo: "", ...body, _id: nextId(s, 2), createdAt: now, updatedAt: now };
  s.students.push(student);
  recordAudit(s, { module: "students", action: "create", targetType: "student", targetId: student._id, targetLabel: fullName(student) });
  return ok({ student }, 201);
});
route("post", /^\/student\/upload-photo\/([^/]+)$/, (s, [key]) => {
  const student = byIdOrTz(s.students, key);
  return student ? ok({ student }) : notFound();
});
route("delete", /^\/student\/photo\/([^/]+)$/, () => ok({ photo: "" }));
route("put", /^\/student\/([^/]+)$/, (s, [key], { body }) => {
  const student = byIdOrTz(s.students, key);
  if (!student) return notFound();
  const { _id, ...patch } = body;
  const changes = diff(student, patch);
  Object.assign(student, patch, { updatedAt: nowIso() });
  recordAudit(s, { module: "students", action: "update", targetType: "student", targetId: student._id, targetLabel: fullName(student), changes });
  return ok({ student });
});
route("delete", /^\/student\/([^/]+)$/, (s, [key]) => {
  const student = byIdOrTz(s.students, key);
  if (!student) return notFound();
  s.students = s.students.filter((st) => st !== student);
  s.lessons.forEach((lesson) => {
    lesson.list_students = lesson.list_students.filter((id) => !same(id, student._id));
  });
  recordAudit(s, { module: "students", action: "delete", targetType: "student", targetId: student._id, targetLabel: fullName(student) });
  return ok({ removed: true });
});

// --- lessons
const lessonView = (lesson) => ({ ...lesson, num_in_list: lesson.list_students.length });
const todayDay = () => new Date().getDay() + 1;
route("get", /^\/lesson$/, (s) => ok({ lessons: s.lessons.map(lessonView) }));
route("get", /^\/lesson\/today$/, (s) => ok({ lessons: s.lessons.filter((l) => l.date.day === todayDay()).map(lessonView) }));
route("get", /^\/lesson\/query$/, (s, _, { params }) =>
  ok({
    lessons: s.lessons
      .filter((l) => !params.day || l.date.day === Number(params.day))
      .filter((l) => !params.teacher || same(l.teacher, params.teacher))
      .filter((l) => !params.helper || same(l.helper, params.helper))
      .filter((l) => !params.room || same(l.room, params.room))
      .map(lessonView),
  })
);
route("get", /^\/lesson\/([^/]+)$/, (s, [id]) => {
  const lesson = s.lessons.find((l) => same(l._id, id));
  return lesson ? ok({ lesson: lessonView(lesson) }) : notFound();
});
const buildLesson = (body, base = {}) => {
  const date = { ...(base.date || { day: 1, startMin: 9 * 60, endMin: 9 * 60 + 45 }), ...(body.date || {}) };
  return {
    ...base,
    ...body,
    date: { day: Number(date.day) || 1, startMin: Number(date.startMin) || 0, endMin: Number(date.endMin) || 0 },
    list_students: Array.isArray(body.list_students) ? body.list_students.map(String) : base.list_students || [],
    room: String(body.room ?? base.room ?? "0"),
  };
};
route("post", /^\/lesson\/addToList\/([^/]+)$/, (s, [id], { body }) => {
  const lesson = s.lessons.find((l) => same(l._id, id));
  if (!lesson) return fail(404);
  const fromTz = (body.list_tz || []).map((tz) => s.students.find((st) => same(st.tz, tz))?._id).filter(Boolean);
  const before = [...lesson.list_students];
  [...(body.list_students || []), ...fromTz].map(String).forEach((sid) => {
    if (!lesson.list_students.includes(sid)) lesson.list_students.push(sid);
  });
  recordAudit(s, { module: "lessons", action: "update", targetType: "lesson", targetId: lesson._id, targetLabel: lesson.name, changes: { list_students: { before, after: [...lesson.list_students] } } });
  return ok({});
});
route("post", /^\/lesson\/removeFromList(?:\/([^/]+))?$/, (s, [id], { body }) => {
  const lesson = s.lessons.find((l) => same(l._id, id || body.id));
  if (!lesson) return fail(404);
  const remove = (body.list_students || body.list_trainees || []).map(String);
  const before = [...lesson.list_students];
  lesson.list_students = lesson.list_students.filter((sid) => !remove.includes(String(sid)));
  recordAudit(s, { module: "lessons", action: "update", targetType: "lesson", targetId: lesson._id, targetLabel: lesson.name, changes: { list_students: { before, after: [...lesson.list_students] } } });
  return ok({ lessons: lessonView(lesson) });
});
route("post", /^\/lesson$/, (s, _, { body }) => {
  const now = nowIso();
  const lesson = buildLesson(body, { _id: nextId(s, 3), teacher: null, helper: null, createdAt: now, updatedAt: now });
  s.lessons.push(lesson);
  recordAudit(s, { module: "lessons", action: "create", targetType: "lesson", targetId: lesson._id, targetLabel: lesson.name });
  return ok({ lesson: lessonView(lesson) }, 201);
});
route("put", /^\/lesson\/([^/]+)$/, (s, [id], { body }) => {
  const index = s.lessons.findIndex((l) => same(l._id, id));
  if (index < 0) return notFound();
  const { _id, ...patch } = body;
  const before = s.lessons[index];
  const lesson = buildLesson(patch, { ...before, updatedAt: nowIso() });
  s.lessons[index] = lesson;
  recordAudit(s, { module: "lessons", action: "update", targetType: "lesson", targetId: lesson._id, targetLabel: lesson.name, changes: diff(before, patch) });
  return ok({ lesson: lessonView(lesson) });
});
route("delete", /^\/lesson\/([^/]+)$/, (s, [id]) => {
  const lesson = s.lessons.find((l) => same(l._id, id));
  if (!lesson) return notFound();
  s.lessons = s.lessons.filter((l) => l !== lesson);
  recordAudit(s, { module: "lessons", action: "delete", targetType: "lesson", targetId: lesson._id, targetLabel: lesson.name });
  return ok({ removed: true });
});

// --- attendance
const dateKeyOf = (y, m, d) => Number(y) * 10000 + Number(m) * 100 + Number(d);
route("get", /^\/attendance\/sheet$/, (s, _, { params }) => {
  const { lessonId, year, month, day } = params;
  if (!lessonId || !Number(year) || !Number(month) || !Number(day)) return fail(400, "lessonId, year, month, day required");
  const lesson = s.lessons.find((l) => same(l._id, lessonId));
  if (!lesson) return fail(404, "Lesson not found");
  const dateKey = dateKeyOf(year, month, day);
  const teacher = s.users.find((u) => same(u._id, lesson.teacher));
  const items = lesson.list_students
    .map((sid) => s.students.find((st) => same(st._id, sid)))
    .filter(Boolean)
    .map((student) => {
      const row = s.attendance.find((r) => same(r.lesson, lesson._id) && same(r.student, student._id) && r.dateKey === dateKey);
      return { studentId: student._id, studentName: fullName(student), tz: student.tz, status: row?.status ?? "حاضر", notes: row?.notes ?? "" };
    });
  return ok({
    schema: {
      lessonId: lesson._id,
      lessonName: lesson.name,
      room: lesson.room,
      teacherName: teacher ? fullName(teacher) : "",
      startMin: lesson.date.startMin,
      endMin: lesson.date.endMin,
      year: Number(year),
      month: Number(month),
      day: Number(day),
      dateKey,
      items,
    },
  });
});
route("post", /^\/attendance\/bulk-save$/, (s, _, { body }) => {
  const { lessonId, year, month, day, items } = body;
  if (!lessonId || !Number(year) || !Number(month) || !Number(day) || !Array.isArray(items)) {
    return fail(400, "lessonId, year, month, day, items required");
  }
  const dateKey = dateKeyOf(year, month, day);
  const result = items.map((item) => {
    let row = s.attendance.find((r) => same(r.lesson, lessonId) && same(r.student, item.studentId) && r.dateKey === dateKey);
    if (!row) {
      row = { lesson: String(lessonId), student: String(item.studentId), dateKey, year: Number(year), month: Number(month), day: Number(day) };
      s.attendance.push(row);
    }
    Object.assign(row, { status: item.status ?? "حاضر", notes: item.notes ?? "", auto: false });
    return row;
  });
  const lesson = s.lessons.find((l) => same(l._id, lessonId));
  recordAudit(s, { module: "attendance", action: "update", targetType: "lesson", targetId: lessonId, targetLabel: lesson?.name || "" });
  return ok({ schema: { result } });
});
route("get", /^\/attendance\/dates$/, (s, _, { params }) => {
  if (!params.lessonId) return fail(400, "lessonId required");
  const keys = [...new Set(s.attendance.filter((r) => same(r.lesson, params.lessonId)).map((r) => r.dateKey))].sort((a, b) => b - a);
  return ok({
    schema: keys.map((dateKey) => {
      const y = Math.floor(dateKey / 10000);
      const m = Math.floor((dateKey % 10000) / 100);
      const d = dateKey % 100;
      return { dateKey, year: y, month: m, day: d, ymd: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}` };
    }),
  });
});

// --- reports
const reportLabel = (r) => r.stitle || (Array.isArray(r.title) ? r.title.join(", ") : "");
route("get", /^\/report$/, (s) =>
  ok({ reports: [...s.reports].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)) })
);
route("get", /^\/report\/([^/]+)$/, (s, [id]) => {
  const report = s.reports.find((r) => same(r._id, id));
  return report ? ok({ report }) : notFound();
});
route("post", /^\/report$/, (s, _, { body }) => {
  const now = nowIso();
  const report = { attendance: [], title: [], stitle: "", info: "", ...body, _id: nextId(s, 4), createdBy: actorOf(s)._id, createdAt: now, updatedAt: now };
  s.reports.push(report);
  recordAudit(s, { module: "reports", action: "create", targetType: "report", targetId: report._id, targetLabel: reportLabel(report) });
  return ok({ report }, 201);
});
route("put", /^\/report\/([^/]+)$/, (s, [id], { body }) => {
  const report = s.reports.find((r) => same(r._id, id));
  if (!report) return notFound();
  const { _id, ...patch } = body;
  const changes = diff(report, patch);
  Object.assign(report, patch, { updatedAt: nowIso() });
  recordAudit(s, { module: "reports", action: "update", targetType: "report", targetId: report._id, targetLabel: reportLabel(report), changes });
  return ok({ report });
});
route("delete", /^\/report\/([^/]+)$/, (s, [id]) => {
  const report = s.reports.find((r) => same(r._id, id));
  if (!report) return notFound();
  s.reports = s.reports.filter((r) => r !== report);
  recordAudit(s, { module: "reports", action: "delete", targetType: "report", targetId: report._id, targetLabel: reportLabel(report) });
  return ok({ removed: true });
});

// --- users
const userView = (u) => ({ ...u });
const findUser = (s, key) =>
  byIdOrTz(s.users, key) || ((same(key, s.me?.tz) || same(key, s.me?.id)) ? actorOf(s) : null);
route("get", /^\/user$/, (s) => ok({ users: s.users.map(userView) }));
route("get", /^\/user\/viewPassword\/([^/]+)$/, () => blocked());
route("get", /^\/user\/([^/]+)\/permissions$/, (s, [key]) => {
  const user = findUser(s, key);
  if (!user) return notFound();
  return ok({
    role: user.role,
    grants: user.permissionGrants || [],
    revokes: user.permissionRevokes || [],
    effective: [],
    defaults: [],
    grantable: [],
    updatedAt: user.permissionsUpdatedAt || null,
    updatedBy: user.permissionsUpdatedBy || null,
  });
});
route("put", /^\/user\/([^/]+)\/permissions$/, (s, [key], { body }) => {
  const user = findUser(s, key);
  if (!user) return notFound();
  Object.assign(user, { permissionGrants: body.grants || [], permissionRevokes: body.revokes || [], permissionsUpdatedAt: nowIso() });
  recordAudit(s, { module: "users", action: "update", targetType: "user", targetId: user.tz, targetLabel: fullName(user) });
  return ok({ grants: user.permissionGrants, revokes: user.permissionRevokes });
});
route("put", /^\/user\/([^/]+)\/role$/, (s, [key], { body }) => {
  const user = findUser(s, key);
  if (!user) return notFound();
  Object.assign(user, { role: body.role, roles: [body.role] });
  recordAudit(s, { module: "users", action: "update", targetType: "user", targetId: user.tz, targetLabel: fullName(user) });
  return ok({ role: body.role, demoted: false });
});
route("post", /^\/user\/([^/]+)\/unlock$/, (s, [key]) => (findUser(s, key) ? ok({}) : notFound()));
route("get", /^\/user\/([^/]+)$/, (s, [key]) => {
  const user = findUser(s, key);
  return user ? ok({ user: userView(user) }) : notFound();
});
route("post", /^\/user$/, (s, _, { body }) => {
  const now = nowIso();
  const { password, ...rest } = body;
  const user = { roles: [], role: null, photo: "", ...rest, _id: nextId(s, 1), room: "active", createdAt: now, updatedAt: now };
  s.users.push(user);
  recordAudit(s, { module: "users", action: "create", targetType: "user", targetId: user.tz, targetLabel: fullName(user) });
  return ok({ user: userView(user) }, 201);
});
route("post", /^\/user\/changeStatus\/([^/]+)$/, (s, [key], { body }) => {
  const user = findUser(s, key);
  if (!user) return notFound();
  user.room = body.to || user.room;
  if (body.role) Object.assign(user, { role: body.role, roles: [body.role] });
  recordAudit(s, { module: "users", action: "update", targetType: "user", targetId: user.tz, targetLabel: fullName(user) });
  return ok({ message: "تم تغيير حالة المستخدم بنجاح" });
});
route("post", /^\/user\/upload-photo\/([^/]+)$/, (s, [key]) => (findUser(s, key) ? ok({ photo: "" }) : notFound()));
route("delete", /^\/user\/photo\/([^/]+)$/, () => ok({ photo: "" }));
route("put", /^\/user\/([^/]+)$/, (s, [key], { body }) => {
  const user = findUser(s, key);
  if (!user) return notFound();
  const { _id, password, ...patch } = body;
  const changes = diff(user, patch);
  Object.assign(user, patch, { updatedAt: nowIso() });
  recordAudit(s, { module: "users", action: "update", targetType: "user", targetId: user.tz, targetLabel: fullName(user), changes });
  return ok({ user: userView(user) });
});
route("delete", /^\/user\/([^/]+)(?:\/([^/]+))?$/, (s, [key]) => {
  const user = byIdOrTz(s.users, key);
  if (!user) return notFound();
  s.users = s.users.filter((u) => u !== user);
  recordAudit(s, { module: "users", action: "delete", targetType: "user", targetId: user.tz, targetLabel: fullName(user) });
  return ok({});
});

// --- vehicles
const findVehicle = (s, id) => s.vehicles.find((v) => same(v._id, id));
const withVehicle = (handler) => (s, params, ctx) => {
  const vehicle = findVehicle(s, params[0]);
  return vehicle ? handler(s, vehicle, params.slice(1), ctx) : fail(404, "المركبة غير موجودة");
};
route("get", /^\/vehicle$/, (s) => ok({ today: s.today, vehicles: s.vehicles.map((v) => toClientVehicle(s, v)) }));
route("get", /^\/vehicle\/alerts$/, (s) => ok({ today: s.today, alerts: s.vehicles.flatMap((v) => buildVehicleAlerts(v, s.today)) }));
route("get", /^\/vehicle\/responsibles$/, (s) =>
  ok({ users: s.users.map((u) => ({ id: u._id, name: fullName(u), tzSuffix: String(u.tz).slice(-4) })) })
);
route("get", /^\/vehicle\/extract\/status$/, () => ok({ available: false }));
route("get", /^\/vehicle\/official-lookup\/([^/]+)$/, () => ok({ found: false }));
route("post", /^\/vehicle$/, (s, _, { body }) => {
  const now = nowIso();
  const actor = actorOf(s);
  const vehicle = {
    type: "vehicle",
    status: "active",
    nickname: "",
    licenses: [],
    tests: [],
    policies: [],
    documents: [],
    nextTestDate: "",
    ...body,
    plate: String(body.plate || "").replace(/\D/g, ""),
    _id: nextId(s, 5),
    createdBy: actor._id,
    createdAt: now,
  };
  s.vehicles.push(vehicle);
  return vehicleWrite(s, vehicle, "create", {}, 201);
});
route("get", /^\/vehicle\/([^/]+)$/, withVehicle((s, v) => ok({ vehicle: toClientVehicle(s, v) })));
route("put", /^\/vehicle\/([^/]+)\/next-test$/, withVehicle((s, v, _, { body }) => vehicleWrite(s, v, "nextTest.set", { nextTestDate: body.nextTestDate || "" })));
route("put", /^\/vehicle\/([^/]+)$/, withVehicle((s, v, _, { body }) => {
  const { _id, licenses, tests, policies, documents, summary, ...patch } = body;
  return vehicleWrite(s, v, "update", patch);
}));
route("get", /^\/vehicle\/([^/]+)\/audit$/, withVehicle((s, v) => ok({ entries: s.vehicleAudit.filter((e) => same(e.vehicleId, v._id)) })));
route("post", /^\/vehicle\/([^/]+)\/archive$/, withVehicle((s, v) => vehicleWrite(s, v, "archive", { status: "archived", archivedAt: nowIso() })));
route("post", /^\/vehicle\/([^/]+)\/restore$/, withVehicle((s, v) => vehicleWrite(s, v, "restore", { status: "active", archivedAt: "" })));
route("delete", /^\/vehicle\/([^/]+)$/, withVehicle((s, v) => {
  s.vehicles = s.vehicles.filter((item) => item !== v);
  recordAudit(s, { module: "vehicles", action: "delete", targetType: "vehicle", targetId: v._id, targetLabel: v.plate });
  return ok({ deletedId: v._id });
}));
route("post", /^\/vehicle\/([^/]+)\/(licenses|tests|policies)$/, withVehicle((s, v, [list], { body }) => {
  const actor = actorOf(s);
  const record = { ...body, id: `${RECORD_KINDS[list]}-${nextId(s, 6)}`, recordedAt: nowIso(), recordedByName: fullName(actor) };
  const patch = { [list]: [...(v[list] || []), record] };
  if (list === "tests" && body.nextTestDate) patch.nextTestDate = body.nextTestDate;
  return vehicleWrite(s, v, `${RECORD_KINDS[list]}.add`, patch, 201);
}));
route("put", /^\/vehicle\/([^/]+)\/(licenses|tests|policies)\/([^/]+)$/, withVehicle((s, v, [list, recordId], { body }) => {
  if (!(v[list] || []).some((r) => same(r.id, recordId))) return fail(404, "السجل غير موجود");
  const patch = { [list]: v[list].map((r) => (same(r.id, recordId) ? { ...r, ...body, id: r.id } : r)) };
  return vehicleWrite(s, v, `${RECORD_KINDS[list]}.update`, patch);
}));
route("post", /^\/vehicle\/([^/]+)\/(licenses|tests|policies)\/([^/]+)\/(void|cancel)$/, withVehicle((s, v, [list, recordId, verb], { body }) => {
  if (!(v[list] || []).some((r) => same(r.id, recordId))) return fail(404, "السجل غير موجود");
  const field = verb === "cancel" ? "cancelledAt" : "voidedAt";
  const patch = { [list]: v[list].map((r) => (same(r.id, recordId) ? { ...r, [field]: nowIso(), reason: body.reason || "" } : r)) };
  return vehicleWrite(s, v, `${RECORD_KINDS[list]}.${verb}`, patch);
}));
route("post", /^\/vehicle\/([^/]+)\/documents$/, withVehicle((s, v, _, { body }) => {
  const actor = actorOf(s);
  const file = body.file;
  const document = {
    id: `doc-${nextId(s, 6)}`,
    kind: body.kind || "other",
    name: file?.name || "مستند-تجريبي.pdf",
    title: body.title || "",
    mimeType: file?.type || "application/pdf",
    size: file?.size || 0,
    linkedType: body.linkedType || "vehicle",
    linkedId: body.linkedId || "",
    uploadedAt: nowIso(),
    uploadedByName: fullName(actor),
    supersededAt: "",
    replacesId: body.replacesId || "",
  };
  const documents = (v.documents || []).map((d) => (body.replacesId && same(d.id, body.replacesId) ? { ...d, supersededAt: nowIso() } : d));
  const res = vehicleWrite(s, v, "document.add", { documents: [...documents, document] }, 201);
  res.data.document = document;
  return res;
}));
route("put", /^\/vehicle\/([^/]+)\/documents\/([^/]+)$/, withVehicle((s, v, [docId], { body }) => {
  if (!(v.documents || []).some((d) => same(d.id, docId))) return fail(404, "المستند غير موجود");
  return vehicleWrite(s, v, "document.rename", { documents: v.documents.map((d) => (same(d.id, docId) ? { ...d, title: body.title || "" } : d)) });
}));
route("delete", /^\/vehicle\/([^/]+)\/documents\/([^/]+)$/, withVehicle((s, v, [docId]) => {
  if (!(v.documents || []).some((d) => same(d.id, docId))) return fail(404, "المستند غير موجود");
  return vehicleWrite(s, v, "document.remove", { documents: v.documents.filter((d) => !same(d.id, docId)) });
}));
route("get", /^\/vehicle\/([^/]+)\/documents\/([^/]+)\/download$/, withVehicle((s, v, [docId]) => {
  const doc = (v.documents || []).find((d) => same(d.id, docId));
  return doc ? { status: 200, data: demoDocumentBlob(doc) } : fail(404, "المستند غير موجود");
}));

// --- notices
const activeNotices = (s) => s.notices.filter((n) => !n.archivedAt).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
route("get", /^\/notices$/, (s, _, { params }) =>
  ok({
    notices: activeNotices(s)
      .filter((n) => (params.status === "unread" ? !n.read : true))
      .filter((n) => !params.category || n.category === params.category)
      .filter((n) => !params.severity || n.severity === params.severity),
  })
);
route("get", /^\/notices\/unread-count$/, (s) => ok({ count: activeNotices(s).filter((n) => !n.read).length }));
route("post", /^\/notices$/, (s, _, { body }) => {
  const actor = actorOf(s);
  const notice = {
    _id: nextId(s, 7),
    title: body.title || "",
    body: body.body || "",
    category: "manual",
    severity: body.severity || "info",
    link: body.link || "",
    createdBy: actor._id,
    createdByName: fullName(actor),
    createdAt: nowIso(),
    read: true,
    archivedAt: null,
  };
  s.notices.push(notice);
  return ok({ notice }, 201);
});
route("post", /^\/notices\/read-all$/, (s) => {
  const unread = s.notices.filter((n) => !n.read);
  unread.forEach((n) => {
    n.read = true;
  });
  return ok({ updated: unread.length });
});
route("post", /^\/notices\/run-vehicle-check$/, () => ok({ created: 0, emailed: 0 }));
route("post", /^\/notices\/([^/]+)\/read$/, (s, [id]) => {
  const notice = s.notices.find((n) => same(n._id, id));
  if (!notice) return notFound();
  notice.read = true;
  return ok({});
});
route("post", /^\/notices\/([^/]+)\/archive$/, (s, [id]) => {
  const notice = s.notices.find((n) => same(n._id, id));
  if (!notice) return notFound();
  notice.archivedAt = nowIso();
  return ok({});
});

// --- audit
const PAGE_SIZE = 50;
route("get", /^\/audit$/, (s, _, { params }) => {
  const q = String(params.q || "").trim().toLowerCase();
  const rows = s.audit
    .filter((r) => ["module", "actor", "action", "targetId"].every((key) => !params[key] || same(r[key], params[key])))
    .filter((r) => !params.from || String(r.at).slice(0, 10) >= params.from)
    .filter((r) => !params.to || String(r.at).slice(0, 10) <= params.to)
    .filter((r) => !q || [r.targetLabel, r.actorName, r.actor].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  return ok({ items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: rows.length });
});

// --- alerts (the signed-in user's inbox)
route("get", /^\/alerts$/, (s, _, { params }) => {
  const unreadOnly = params.unread === "1" || params.unread === "true";
  const alerts = [...s.alerts].filter((a) => !unreadOnly || !a.read).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return ok({ alerts, total: alerts.length });
});
route("post", /^\/alerts\/read-all$/, (s) => {
  const unread = s.alerts.filter((a) => !a.read);
  unread.forEach((a) => {
    a.read = true;
  });
  return ok({ updated: unread.length });
});
route("post", /^\/alerts\/([^/]+)\/read$/, (s, [id]) => {
  const alert = s.alerts.find((a) => same(a.id, id));
  if (!alert) return fail(404, "التنبيه غير موجود", { code: "NOT_FOUND" });
  alert.read = true;
  return ok({});
});

// --- files
route("get", /^\/storage\/list$/, (s, _, { params }) => {
  const folder = trim(params.path);
  const items = s.files.filter((f) => parentOf(f.path) === folder).map((f) => withFolderSize(s, f));
  return ok({
    success: true,
    path: folder,
    folders: items.filter((f) => f.isDirectory),
    files: items.filter((f) => !f.isDirectory),
    items,
  });
});
route("get", /^\/storage\/stats$/, (s) => {
  const used = s.files.reduce((sum, f) => sum + (f.isDirectory ? 0 : f.size || 0), 0);
  const free = 5 * 1024 * 1024 * 1024;
  return ok({
    success: true,
    scope: "global",
    serverTotalBytes: used + free,
    serverFreeBytes: free,
    serverUsedBytes: used,
    tamheedUsedBytes: used,
    tamheedAvailableBytes: free,
    tamheedTotalBytes: used + free,
    displayTotalBytes: used + free,
    displayUsedBytes: used,
    displayAvailableBytes: free,
  });
});
route("get", /^\/storage\/share-status$/, () => ok({ sharedWith: [] }));
route("get", /^\/storage\/google\/status$/, () => ok({ connected: true, email: "demo-drive@example.com", canConnect: false }));
route("post", /^\/storage\/folder$/, (s, _, { body }) => {
  const name = trim(body.name);
  if (!name || name.includes("/")) return fail(400, "Folder name is required");
  const path = joinPath(trim(body.path), name);
  const actor = actorOf(s);
  const folder = { name, path, filename: path, isDirectory: true, size: 0, modifiedAt: nowIso(), ownerName: fullName(actor) };
  if (!s.files.some((f) => f.path === path)) s.files.push(folder);
  recordAudit(s, { module: "storage", action: "create", targetType: "folder", targetId: path, targetLabel: name });
  return ok({ success: true, folder: { ...folder, type: "folder" } }, 201);
});
route("post", /^\/storage\/upload$/, (s, _, { body }) => {
  const file = body.file;
  const name = trim(body.name) || file?.name || "ملف-تجريبي";
  const path = joinPath(trim(body.path), name);
  const actor = actorOf(s);
  const entry = { name, path, filename: path, isDirectory: false, size: file?.size || 0, mimeType: file?.type || "", modifiedAt: nowIso(), ownerName: fullName(actor) };
  s.files = s.files.filter((f) => f.path !== path).concat(entry);
  recordAudit(s, { module: "storage", action: "upload", targetType: "file", targetId: path, targetLabel: name });
  return ok({ success: true, filename: name, path, size: entry.size, file: entry }, 201);
});
route("delete", /^\/storage\/delete$/, (s, _, { body }) => {
  const path = trim(body.relativePath);
  if (!s.files.some((f) => f.path === path)) return fail(404, "الملف غير موجود");
  s.files = s.files.filter((f) => f.path !== path && !f.path.startsWith(`${path}/`));
  recordAudit(s, { module: "storage", action: "delete", targetType: "file", targetId: path, targetLabel: path });
  return ok({ success: true });
});
route("patch", /^\/storage\/rename$/, (s, _, { body }) => {
  const path = trim(body.relativePath);
  const entry = s.files.find((f) => f.path === path);
  const newName = trim(body.newName);
  if (!entry || !newName || newName.includes("/")) return fail(400, "تعذّرت إعادة التسمية");
  const next = joinPath(parentOf(path), newName);
  s.files.forEach((f) => {
    if (f.path === path || f.path.startsWith(`${path}/`)) {
      f.path = next + f.path.slice(path.length);
      f.filename = f.path;
    }
  });
  entry.name = newName;
  recordAudit(s, { module: "storage", action: "update", targetType: "file", targetId: next, targetLabel: newName });
  return ok({ success: true, path: next });
});

// --- assistant: switched off during training
route("get", /^\/ai\/status$/, () => ok({ enabled: false }));
route("get", /^\/ai\/conversations$/, () => ok({ result: [] }));

// --- parent registration link (administrators)
route("get", /^\/inviteToken\/link$/, () => ok({ token: "demo", usedThisWeek: 0, weeklyLimit: 20, attempts: [] }));

/**
 * @returns {{status:number, data:any} | null}
 */
export function handleDemoRequest({ method = "get", url = "", params, data } = {}, store) {
  if (!store) return null;
  const verb = String(method).toLowerCase();
  const { path, query } = normalizeUrl(url);
  const ctx = { params: { ...query, ...(params || {}) }, body: readBody(data) };
  for (const { method: m, pattern, handler } of ROUTES) {
    if (m !== verb) continue;
    const match = pattern.exec(path);
    if (!match) continue;
    const args = match.slice(1).map((part) => (part === undefined ? undefined : decodeURIComponent(part)));
    const answer = handler(store, args, ctx);
    if (!answer) return null;
    // Screens get copies, so editing what they hold never changes the store.
    return typeof Blob !== "undefined" && answer.data instanceof Blob ? answer :{ status: answer.status, data: JSON.parse(JSON.stringify(answer.data)) };
  }
  return null;
}
