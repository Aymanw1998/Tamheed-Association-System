const assert = require("node:assert/strict");
const test = require("node:test");
const { createStaffConversion, israelDateKey } = require("../services/staffConversion");
const { sameVersion, nextStamp } = require("../middleware/lockGuard");

// A student becomes staff (owner, 2026-11-19): phases, claim, resume, rosters,
// archive, rows after the cutover. Synthetic ids and names only.

const id = (c) => c.repeat(24);
const STUDENT_ID = id("5");
const ACTOR = { id: id("a") };

// An in-memory store with the Mongo bits the service uses: equality, dotted
// paths, $or, $lt and dotted $set keys.
function store(seed = []) {
  let docs = seed.map((d) => structuredClone(d));
  const pathOf = (doc, key) => key.split(".").reduce((v, k) => (v == null ? undefined : v[k]), doc);
  const test1 = (doc, key, cond) => {
    const value = pathOf(doc, key);
    if (cond && typeof cond === "object" && !(cond instanceof Date) && "$lt" in cond) return value != null && new Date(value) < new Date(cond.$lt);
    if (cond === null) return value == null;
    // Dates to the millisecond, like MongoDB (String() keeps seconds only).
    const stamp = (v) => (v instanceof Date ? v.toISOString() : String(v));
    if (Array.isArray(value)) return value.some((v) => stamp(v) === stamp(cond));
    return stamp(value) === stamp(cond);
  };
  const matches = (doc, filter = {}) => Object.entries(filter).every(([k, v]) => (k === "$or" ? v.some((f) => matches(doc, f)) : test1(doc, k, v)));
  const setPath = (doc, key, value) => {
    const parts = key.split(".");
    let at = doc;
    for (const p of parts.slice(0, -1)) { if (at[p] == null || typeof at[p] !== "object") at[p] = {}; at = at[p]; }
    at[parts.at(-1)] = structuredClone(value);
  };
  let n = 0;
  return {
    failNext: {},
    all: () => docs,
    async get(filter = {}) {
      if (this.failNext.get) { this.failNext.get -= 1; throw new Error("read failed"); }
      return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) };
    },
    async create(data) {
      if (this.failNext.create) { this.failNext.create -= 1; throw new Error("create failed"); }
      const doc = { _id: data._id || `row-${n++}`, ...structuredClone(data) };
      docs.push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async updateExisting(filter, patch) {
      if (this.failNext.updateExisting) { this.failNext.updateExisting -= 1; throw new Error("write failed"); }
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { success: true, result: null };
      for (const [k, v] of Object.entries(patch)) setPath(doc, k, v);
      return { success: true, result: structuredClone(doc) };
    },
    async update(filter, patch) { return this.updateExisting(filter, patch); },
    async delete(filter) { const before = docs.length; docs = docs.filter((d) => !matches(d, filter)); return { success: true, result: { deletedCount: before - docs.length } }; },
  };
}

function world({ student = {}, lessonList, rows = [], userSeed = [], photoFails = false, staff = [] } = {}) {
  const students = store([{ _id: STUDENT_ID, tz: "123456782", firstname: "علي", lastname: "طالب", status: "عادي", phone: "0500000000", ...student }]);
  const lessons = store(lessonList || [
    { _id: id("1"), name: "أ", teacher: id("b"), list_students: [STUDENT_ID, id("6")], list_users: [], updatedAt: new Date("2026-11-01") },
    { _id: id("2"), name: "ب", teacher: id("b"), list_students: [STUDENT_ID], list_users: [id("c")], updatedAt: new Date("2026-11-01") },
    { _id: id("3"), name: "ج", teacher: id("b"), list_students: [id("6")], list_users: [], updatedAt: new Date("2026-11-01") },
  ]);
  const users = store(userSeed);
  const attendance = store(rows);
  const audits = [];
  let auditOk = true;
  let nextId = 0;
  const made = [];
  const linked = [];
  const photos = [];
  const failCreate = { times: 0 };
  const conversion = createStaffConversion({
    students, lessons, users, attendance,
    recordRequired: async (req, entry) => { if (!auditOk) return false; audits.push(entry); return true; },
    createUser: async ({ student, conv }) => {
      if (failCreate.times) { failCreate.times -= 1; throw new Error("create failed"); }
      const existing = (await users.get({ _id: conv.userId })).result[0];
      if (existing) return {};
      if (student.tz === "taken") return { status: 409, clear: true, body: { ok: false, code: "TZ_EXISTS" } };
      await users.create({ _id: conv.userId, tz: student.tz, role: conv.role, fromStudentId: String(student._id) });
      made.push(conv.userId);
      return {};
    },
    copyPhoto: async (args) => { photos.push(args); if (photoFails) throw new Error("drive down"); },
    // Existing staff (owner, 2026-11-26): { ...user, room } rows in `staff`.
    findStaff: async (tz) => {
      const row = staff.find((u) => u.tz === tz);
      return row ? { user: { ...row }, room: row.room } : null;
    },
    linkUser: async ({ student, conv }) => {
      const row = staff.find((u) => u._id === conv.userId);
      if (!row || row.room !== "active") return { status: 409, clear: true, body: { ok: false, code: "STAFF_NOT_ACTIVE" } };
      if (row.fromStudentId && row.fromStudentId !== String(student._id)) return { status: 409, clear: true, body: { ok: false, code: "LINKED_ELSEWHERE" } };
      row.fromStudentId = String(student._id);
      linked.push(row._id);
      return {};
    },
    newId: () => id(String.fromCharCode(100 + nextId++)), // "dddd…", "eeee…"
    now: () => new Date("2026-11-19T10:00:00Z"),
    sameVersion, nextStamp, log: (where, e) => { if (process.env.DEBUG_CONV) console.error(where, e); },
  });
  const run = (body = { role: "مساعد", password: "Secret-123", phone: "0501111111" }, extra = {}) => conversion.run({
    actor: ACTOR, req: {}, studentId: STUDENT_ID, body, requestId: extra.requestId || `r-${Math.random()}`,
    mayAccess: async () => true, mayGiveRole: () => true, ...extra,
  });
  const current = () => students.all()[0];
  const preview = (extra = {}) => conversion.preview({ studentId: STUDENT_ID, mayAccess: async () => true, mayGiveRole: () => true, ...extra });
  return { students, lessons, users, attendance, audits, made, linked, photos, staff, failCreate, run, preview, student: current, setAudit: (v) => { auditOk = v; } };
}

test("a full conversion makes one user, moves him in his programs and archives the student", async () => {
  const w = world();
  const out = await w.run();
  assert.equal(out.status, 200, JSON.stringify(out.body));
  const userId = out.body.userId;
  assert.deepEqual(w.made, [userId]);
  const [a, b, c] = w.lessons.all();
  assert.deepEqual(a.list_students, [id("6")]);
  assert.deepEqual(a.list_users, [userId]);
  assert.deepEqual(b.list_students, []);
  assert.deepEqual(b.list_users, [id("c"), userId]);
  assert.deepEqual(c.list_users, [], "a program he was not in is untouched");
  const s = w.student();
  assert.equal(s.staffConversion.phase, "done");
  assert.deepEqual([...s.staffConversion.plannedLessons].sort(), [id("1"), id("2")]);
  assert.equal(s.staffConversion.cutoverDateKey, 20261120, "the day after, Israel time");
  assert.ok(s.archivedAt);
  assert.equal(s.conversionClaim, null, "claim released");
  assert.equal(w.audits.length, 1);
  assert.equal(w.audits[0].action, "make_staff");
});

test("without the audit row nothing changes (503)", async () => {
  const w = world();
  w.setAudit(false);
  const out = await w.run();
  assert.equal(out.status, 503);
  assert.equal(out.body.code, "AUDIT_FAILED");
  assert.equal(w.student().staffConversion, undefined);
  assert.equal(w.made.length, 0);
  assert.deepEqual(w.lessons.all()[0].list_students, [STUDENT_ID, id("6")]);
});

test("only an assistant or a guide; only an accepted, active student", async () => {
  assert.equal((await world().run({ role: "ادارة", password: "x", phone: "1" })).body.code, "UNKNOWN_ROLE");
  assert.equal((await world({ student: { status: "ينتظر" } }).run()).body.code, "NOT_ELIGIBLE");
  const forbidden = await world().run(undefined, { mayGiveRole: () => false });
  assert.equal(forbidden.status, 403);
});

test("a call while another holds the claim is refused (CONVERSION_BUSY)", async () => {
  const w = world({ student: { conversionClaim: { by: "other", until: new Date("2026-11-19T10:01:00Z") } } });
  const out = await w.run();
  assert.equal(out.status, 409);
  assert.equal(out.body.code, "CONVERSION_BUSY");
  assert.equal(w.student().staffConversion, undefined);
});

test("an expired claim (a crashed call) can be taken over", async () => {
  const w = world({ student: { conversionClaim: { by: "crashed", until: new Date("2026-11-19T09:00:00Z") } } });
  assert.equal((await w.run()).status, 200);
});

test("a stop before the account is made, then «إكمال التحويل», ends with exactly one user", async () => {
  const w = world();
  w.failCreate.times = 1;
  const first = await w.run();
  assert.equal(first.status, 503);
  assert.equal(first.body.code, "CONVERSION_INCOMPLETE");
  assert.equal(w.student().staffConversion.phase, "prepared");
  const plannedId = w.student().staffConversion.userId;
  const second = await w.run({ password: "Secret-123", phone: "0501111111" });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.userId, plannedId, "the _id chosen once is kept");
  assert.deepEqual(w.made, [plannedId]);
  assert.equal(w.users.all().length, 1);
});

test("a stop while moving programs, then resume, finishes every program once", async () => {
  const w = world();
  w.lessons.failNext.updateExisting = 1;
  const first = await w.run();
  assert.equal(first.status, 503);
  assert.equal(w.student().staffConversion.phase, "account");
  const second = await w.run({});
  assert.equal(second.status, 200, JSON.stringify(second.body));
  const userId = second.body.userId;
  for (const lesson of w.lessons.all().slice(0, 2)) {
    assert.ok(!lesson.list_students.includes(STUDENT_ID));
    assert.equal(lesson.list_users.filter((u) => u === userId).length, 1);
  }
  assert.equal(w.users.all().length, 1);
});

test("a tz already used by staff stops it and clears the conversion", async () => {
  const w = world({ student: { tz: "taken" } });
  const out = await w.run();
  assert.equal(out.status, 409);
  assert.equal(w.student().staffConversion, null);
  assert.deepEqual(w.lessons.all()[0].list_students, [STUDENT_ID, id("6")]);
});

test("in a program where he is already «المسؤول» he leaves the students and is not added as a participant", async () => {
  const w = world({ lessonList: [{ _id: id("1"), name: "أ", teacher: id("d"), list_students: [STUDENT_ID], list_users: [], updatedAt: new Date("2026-11-01") }] });
  const out = await w.run();
  assert.equal(out.status, 200);
  assert.equal(out.body.userId, id("d"));
  assert.deepEqual(w.lessons.all()[0].list_students, []);
  assert.deepEqual(w.lessons.all()[0].list_users, []);
});

test("rows on or after the cutover: never saved -> deleted, saved -> become his staff row", async () => {
  const rows = [
    { _id: "past", lesson: id("1"), student: STUDENT_ID, dateKey: 20261119, status: "غائب", updatedBy: "x" },
    { _id: "auto", lesson: id("1"), student: STUDENT_ID, dateKey: 20261121, status: "حاضر" },
    { _id: "saved", lesson: id("1"), student: STUDENT_ID, dateKey: 20261122, status: "غائب", notes: "مريض", auto: false },
  ];
  const w = world({ rows });
  const out = await w.run();
  assert.equal(out.status, 200);
  const left = w.attendance.all();
  assert.deepEqual(left.map((r) => r._id).sort(), ["past", "saved"]);
  const saved = left.find((r) => r._id === "saved");
  assert.equal(saved.student, null);
  assert.equal(saved.user, out.body.userId);
  assert.equal(saved.notes, "مريض");
  assert.equal(left.find((r) => r._id === "past").student, STUDENT_ID, "the conversion day stays a student day");
});

test("a second conversion of the same student is refused", async () => {
  const w = world();
  assert.equal((await w.run()).status, 200);
  const again = await w.run();
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "ALREADY_STAFF");
});

test("israelDateKey uses the Israel date", () => {
  assert.equal(israelDateKey(new Date("2026-11-19T22:30:00Z")), 20261120, "00:30 in Israel is already the 20th");
  assert.equal(israelDateKey(new Date("2026-12-31T10:00:00Z"), 1), 20270101);
});

/* ---------- Codex build review fixes (2026-11-20) ---------- */

test("a refused account (tz of other staff) leaves the attendance untouched", async () => {
  const rows = [
    { _id: "auto", lesson: id("1"), student: STUDENT_ID, dateKey: 20261121, status: "حاضر" },
    { _id: "saved", lesson: id("1"), student: STUDENT_ID, dateKey: 20261122, status: "غائب", auto: false },
  ];
  const w = world({ student: { tz: "taken" }, rows });
  assert.equal((await w.run()).status, 409);
  assert.deepEqual(w.attendance.all().map((r) => [r._id, r.student]), [["auto", STUDENT_ID], ["saved", STUDENT_ID]]);
});

test("every conversion write moves the student's version on (an edit read before it fails)", async () => {
  const before = new Date("2026-01-01T00:00:00Z");
  const w = world({ student: { updatedAt: before } });
  assert.equal((await w.run()).status, 200);
  assert.notEqual(String(w.student().updatedAt), String(before));
});

test("a resume is checked like a first call: the stored role and the first password", async () => {
  const w = world();
  w.failCreate.times = 1;
  assert.equal((await w.run()).status, 503);
  const forbidden = await w.run({ password: "Secret-123", phone: "1" }, { mayGiveRole: () => false });
  assert.equal(forbidden.status, 403);
  const noPassword = await w.run({});
  assert.equal(noPassword.status, 400);
  assert.equal(noPassword.body.code, "MISSING_FIELDS");
  assert.equal(w.users.all().length, 0);
});

test("a program found by the last scan gets its rows after the cutover settled", async () => {
  const lessonList = [
    { _id: id("1"), name: "أ", teacher: id("b"), list_students: [STUDENT_ID], list_users: [], updatedAt: new Date("2026-11-01") },
    { _id: id("2"), name: "ب", teacher: id("b"), list_students: [], list_users: [], updatedAt: new Date("2026-11-01") },
  ];
  const rows = [{ _id: "late", lesson: id("2"), student: STUDENT_ID, dateKey: 20261125, status: "حاضر" }];
  const w = world({ lessonList, rows });
  // A raced add lands in program 2 while program 1 is being moved.
  const original = w.lessons.updateExisting.bind(w.lessons);
  let raced = false;
  w.lessons.updateExisting = async (filter, patch) => {
    const out = await original(filter, patch);
    if (!raced) { raced = true; w.lessons.all()[1].list_students.push(STUDENT_ID); }
    return out;
  };
  const out = await w.run();
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.ok(w.student().staffConversion.plannedLessons.includes(id("2")));
  assert.deepEqual(w.lessons.all()[1].list_students, []);
  assert.equal(w.attendance.all().length, 0, "the unsaved row after the cutover is gone");
});

// Codex build review 2.
test("the student's version moves strictly forward, even past a stamp ahead of the clock", async () => {
  const ahead = new Date(Date.now() + 60 * 60 * 1000);
  const w = world({ student: { updatedAt: ahead } });
  assert.equal((await w.run()).status, 200);
  assert.ok(new Date(w.student().updatedAt).getTime() > ahead.getTime());
});

test("a resume after a late program joined the plan still settles its rows", async () => {
  const lessonList = [
    { _id: id("1"), name: "أ", teacher: id("b"), list_students: [STUDENT_ID], list_users: [], updatedAt: new Date("2026-11-01") },
    { _id: id("2"), name: "ب", teacher: id("b"), list_students: [], list_users: [], updatedAt: new Date("2026-11-01") },
  ];
  const rows = [{ _id: "late", lesson: id("2"), student: STUDENT_ID, dateKey: 20261125, status: "حاضر" }];
  const w = world({ lessonList, rows });
  const original = w.lessons.updateExisting.bind(w.lessons);
  let raced = false;
  w.lessons.updateExisting = async (filter, patch) => {
    const out = await original(filter, patch);
    if (!raced) { raced = true; w.lessons.all()[1].list_students.push(STUDENT_ID); }
    return out;
  };
  // The first settle (after the account) reads fine; the one after the late
  // program joined fails, so the call stops there.
  const get = w.attendance.get.bind(w.attendance);
  let reads = 0;
  w.attendance.get = async (filter) => { reads += 1; if (reads === 2) throw new Error("read failed"); return get(filter); };
  assert.equal((await w.run()).status, 503);
  assert.ok(w.student().staffConversion.plannedLessons.includes(id("2")));
  const resumed = await w.run({});
  assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
  assert.equal(w.attendance.all().length, 0, "the late program's row after the cutover is settled on resume");
});

/* ---------- testing review, 2026-11-20: writes that race the conversion ---------- */

test("a call that lost its claim stops: no further phase is written", async () => {
  const w = world();
  const original = w.students.updateExisting.bind(w.students);
  w.students.updateExisting = async (filter, patch) => {
    const out = await original(filter, patch);
    if (patch.staffConversion?.phase === "prepared") w.students.all()[0].conversionClaim = { by: "other", until: new Date("2026-11-19T10:05:00Z") };
    return out;
  };
  const out = await w.run();
  assert.equal(out.status, 503);
  assert.equal(w.student().staffConversion.phase, "prepared", "the account phase was not written by a call without the claim");
  assert.equal(w.student().conversionClaim.by, "other", "the other call's claim is left alone");
});

test("an edit that lands between the conversion's read and write is not overwritten backwards", async () => {
  const w = world({ student: { updatedAt: new Date("2026-11-01T00:00:00Z") } });
  const editStamp = new Date(Date.now() + 60 * 60 * 1000);
  const original = w.students.updateExisting.bind(w.students);
  let raced = false;
  w.students.updateExisting = async (filter, patch) => {
    if (!raced && "updatedAt" in filter) { raced = true; w.students.all()[0].updatedAt = editStamp; }
    return original(filter, patch);
  };
  assert.equal((await w.run()).status, 200);
  assert.ok(new Date(w.student().updatedAt).getTime() > editStamp.getTime(), "the version moved past the edit");
});

test("a program edited between the move's read and write keeps the edit", async () => {
  const w = world();
  const original = w.lessons.updateExisting.bind(w.lessons);
  let raced = false;
  w.lessons.updateExisting = async (filter, patch) => {
    if (!raced) {
      raced = true;
      const lesson = w.lessons.all()[0];
      lesson.list_students = [...lesson.list_students, id("7")];
      lesson.updatedAt = new Date("2026-11-02T00:00:00.123Z");
    }
    return original(filter, patch);
  };
  assert.equal((await w.run()).status, 200);
  const first = w.lessons.all()[0];
  assert.ok(first.list_students.includes(id("7")), "the student added meanwhile is still there");
  assert.ok(!first.list_students.includes(STUDENT_ID));
});

test("a person who saves the row while it is being settled keeps the mark", async () => {
  const rows = [{ _id: "late", lesson: id("1"), student: STUDENT_ID, dateKey: 20261125, status: "حاضر", updatedAt: new Date("2026-11-19T08:00:00Z") }];
  const w = world({ rows });
  const original = w.attendance.delete.bind(w.attendance);
  let raced = false;
  w.attendance.delete = async (filter) => {
    if (!raced) { raced = true; Object.assign(w.attendance.all()[0], { status: "غائب", auto: false, updatedBy: "teacher", updatedAt: new Date("2026-11-19T09:00:00.500Z") }); }
    return original(filter);
  };
  const out = await w.run();
  assert.equal(out.status, 200);
  const [row] = w.attendance.all();
  assert.equal(row?.status, "غائب", "kept");
  assert.equal(row.user, out.body.userId, "as his staff row");
});

test("a saved row on or after the cutover, beside an existing staff row, leaves one row", async () => {
  const w = world({ rows: [{ _id: "saved", lesson: id("1"), student: STUDENT_ID, dateKey: 20261125, status: "غائب", auto: false }] });
  // His staff row for that date already exists (the id the prepared phase will choose).
  w.attendance.all().push({ _id: "staff", lesson: id("1"), user: id("d"), dateKey: 20261125, status: "حاضر", auto: false });
  const out = await w.run();
  assert.equal(out.status, 200);
  assert.equal(out.body.userId, id("d"));
  const forDay = w.attendance.all().filter((r) => r.dateKey === 20261125);
  assert.deepEqual(forDay.map((r) => r._id), ["staff"]);
});

test("a stop in preparing, then a resume, finishes once", async () => {
  const w = world();
  const original = w.students.updateExisting.bind(w.students);
  let failOnce = true;
  w.students.updateExisting = async (filter, patch) => {
    if (failOnce && patch.staffConversion?.phase === "prepared") { failOnce = false; throw new Error("write failed"); }
    return original(filter, patch);
  };
  assert.equal((await w.run()).status, 503);
  assert.equal(w.student().staffConversion.phase, "preparing");
  const out = await w.run();
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(w.made.length, 1);
});

test("a stop at the archive, then a resume, archives once", async () => {
  const w = world();
  const original = w.students.updateExisting.bind(w.students);
  let failOnce = true;
  w.students.updateExisting = async (filter, patch) => {
    if (failOnce && patch.staffConversion?.phase === "done") { failOnce = false; throw new Error("write failed"); }
    return original(filter, patch);
  };
  assert.equal((await w.run()).status, 503);
  assert.equal(w.student().staffConversion.phase, "rosters");
  assert.equal((await w.run({})).status, 200);
  assert.equal(w.student().staffConversion.phase, "done");
  assert.ok(w.student().archivedAt);
  assert.equal(w.made.length, 1);
});

test("a failed photo copy still finishes, and says so", async () => {
  const w = world({ photoFails: true });
  const out = await w.run();
  assert.equal(out.status, 200);
  assert.equal(out.body.photoCopied, false);
  assert.equal(w.student().staffConversion.phase, "done");
});

test("two calls at once: one converts, the other is told it is busy", async () => {
  const w = world();
  const [a, b] = await Promise.all([w.run(undefined, { requestId: "one" }), w.run(undefined, { requestId: "two" })]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(w.made.length, 1);
  assert.equal(w.users.all().length, 1);
});

/* ---------- Codex build review 5 and the testing review ---------- */

test("rows from the cutover in a program outside the plan are settled too", async () => {
  const rows = [
    { _id: "outAuto", lesson: id("3"), student: STUDENT_ID, dateKey: 20261125, status: "غائب", auto: true },
    { _id: "outSaved", lesson: id("3"), student: STUDENT_ID, dateKey: 20261126, status: "متأخر", auto: false },
  ];
  const w = world({ rows });
  const out = await w.run();
  assert.equal(out.status, 200);
  const left = w.attendance.all();
  assert.deepEqual(left.map((r) => r._id), ["outSaved"]);
  assert.equal(left[0].user, out.body.userId, "a person's mark becomes his staff row");
});

test("a resume refused for its role or password writes nothing first", async () => {
  const w = world({ student: { staffConversion: { phase: "preparing", role: "مرشد" } } });
  const noPassword = await w.run({});
  assert.equal(noPassword.status, 400);
  assert.equal(w.student().staffConversion.phase, "preparing");
  assert.equal(w.student().staffConversion.userId, undefined);
  const forbidden = await w.run({ password: "Secret-123", phone: "1" }, { mayGiveRole: () => false });
  assert.equal(forbidden.status, 403);
  assert.equal(w.student().staffConversion.phase, "preparing");
});

test("an archived student cannot be converted", async () => {
  const w = world({ student: { archivedAt: new Date("2026-11-01") } });
  const out = await w.run();
  assert.equal(out.body.code, "NOT_ELIGIBLE");
  assert.equal(w.student().staffConversion, undefined);
});

test("a claim taken over between the read and the write stops the call", async () => {
  const w = world();
  const original = w.students.updateExisting.bind(w.students);
  let raced = false;
  w.students.updateExisting = async (filter, patch) => {
    // The first write after the account: another call takes the claim just before it lands.
    if (!raced && patch.staffConversion?.phase === "account") { raced = true; w.students.all()[0].conversionClaim = { by: "other", until: new Date("2026-11-19T10:05:00Z") }; }
    return original(filter, patch);
  };
  const out = await w.run();
  assert.equal(out.status, 503);
  assert.equal(w.student().staffConversion.phase, "prepared");
  assert.equal(w.student().conversionClaim.by, "other");
});

/* ---------- owner, 2026-11-26: staff with his ID number already exists ---------- */
// The student is linked to that account instead of a new one: same moves,
// cutover and archive; the account keeps its role and details.
const EXISTING = { _id: id("f"), tz: "123456782", firstname: "علي", lastname: "موظف", role: "مرشد", room: "active" };

test("staff with the student's ID number: he is linked to that account, no new one, no password", async () => {
  const w = world({ staff: [{ ...EXISTING }] });
  const out = await w.run({});
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.userId, EXISTING._id);
  assert.equal(out.body.linked, true);
  assert.deepEqual(w.made, [], "no account made");
  assert.deepEqual(w.linked, [EXISTING._id]);
  assert.equal(w.staff[0].fromStudentId, STUDENT_ID, "the account is marked as his");
  const [a, b] = w.lessons.all();
  assert.deepEqual(a.list_students, [id("6")]);
  assert.deepEqual(a.list_users, [EXISTING._id]);
  assert.deepEqual(b.list_users, [id("c"), EXISTING._id]);
  const s = w.student();
  assert.equal(s.staffConversion.phase, "done");
  assert.equal(s.staffConversion.role, "مرشد", "the account's own role");
  assert.ok(s.archivedAt);
  assert.deepEqual(w.audits[0].after, { role: "مرشد", linkedUserId: EXISTING._id });
  assert.equal(w.photos[0].keepExisting, true, "the account keeps its own photo");
});

test("a role or password sent along is ignored when linking", async () => {
  const w = world({ staff: [{ ...EXISTING }] });
  const out = await w.run({ role: "مساعد", password: "x", phone: "1" });
  assert.equal(out.status, 200);
  assert.equal(w.student().staffConversion.role, "مرشد");
});

test("existing staff that is not active (waiting or suspended): refused, nothing changed", async () => {
  for (const room of ["waiting", "noActive"]) {
    const w = world({ staff: [{ ...EXISTING, room }] });
    const out = await w.run();
    assert.equal(out.status, 409);
    assert.equal(out.body.code, "STAFF_NOT_ACTIVE");
    assert.equal(w.student().staffConversion, undefined);
    assert.equal(w.audits.length, 0);
    assert.deepEqual(w.made, [], "no second account either");
  }
});

test("existing staff linked to another student: refused, nothing changed", async () => {
  const w = world({ staff: [{ ...EXISTING, fromStudentId: id("6") }] });
  const out = await w.run();
  assert.equal(out.body.code, "LINKED_ELSEWHERE");
  assert.equal(w.student().staffConversion, undefined);
  assert.equal(w.lessons.all()[0].list_students.length, 2);
});

test("linking needs the right to give that account's role", async () => {
  const w = world({ staff: [{ ...EXISTING, role: "ادارة" }] });
  const out = await w.run({}, { mayGiveRole: (role) => role !== "ادارة" });
  assert.equal(out.status, 403);
  assert.equal(w.student().staffConversion, undefined);
  assert.equal(w.audits.length, 0);
});

test("an account that stopped being active before the link: the conversion is cleared, nothing moved", async () => {
  const w = world({ staff: [{ ...EXISTING }] });
  // Stopped right after "preparing" (the link was chosen), then the account was suspended.
  w.students.all()[0].staffConversion = { phase: "preparing", role: "مرشد", linkUserId: EXISTING._id };
  w.staff[0].room = "noActive";
  const out = await w.run({});
  assert.equal(out.status, 409);
  assert.equal(w.student().staffConversion, null);
  assert.deepEqual(w.lessons.all()[0].list_students, [STUDENT_ID, id("6")]);
  assert.equal(w.student().archivedAt, undefined);
});

test("a stopped link is resumed without a password and ends once", async () => {
  const w = world({ staff: [{ ...EXISTING }] });
  w.students.all()[0].staffConversion = { phase: "preparing", role: "مرشد", linkUserId: EXISTING._id };
  const out = await w.run({});
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(w.student().staffConversion.userId, EXISTING._id);
  assert.deepEqual(w.linked, [EXISTING._id]);
  assert.deepEqual(w.made, []);
});

test("preview: nothing found, or the account and whether he can be linked (never its id)", async () => {
  assert.deepEqual((await world().preview()).body, { ok: true, existing: null });
  const out = await world({ staff: [{ ...EXISTING }] }).preview();
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.existing, { name: "علي موظف", role: "مرشد", active: true, linkedElsewhere: false, mayLink: true });
  const waiting = await world({ staff: [{ ...EXISTING, room: "waiting", fromStudentId: id("6") }] }).preview({ mayGiveRole: () => false });
  assert.deepEqual(waiting.body.existing, { name: "علي موظف", role: "مرشد", active: false, linkedElsewhere: true, mayLink: false });
});

test("preview: an ordinary conversion resumed after its account was made shows no existing staff", async () => {
  const w = world({ staff: [{ ...EXISTING, _id: id("d"), fromStudentId: STUDENT_ID }] });
  w.students.all()[0].staffConversion = { phase: "account", role: "مساعد", userId: id("d") };
  assert.equal((await w.preview()).body.existing, null);
});

test("preview: a student outside the actor's scope is not found", async () => {
  const out = await world({ staff: [{ ...EXISTING }] }).preview({ mayAccess: async () => false });
  assert.equal(out.status, 404);
});
