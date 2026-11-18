const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

const OLD_PHOTO = "https://lh3.googleusercontent.com/d/old-file";
const NEW_PHOTO = "https://lh3.googleusercontent.com/d/new-file";

// In-memory stand-in for the generic Mongo-backed model CRUD. Every write is
// appended to the shared `events` log so tests can assert ordering against
// the Drive calls.
function createModel(records, events, extra = {}) {
  let docs = records.map((record) => ({ ...record }));
  const matches = (doc, filter = {}) =>
    Object.keys(filter).every((key) => (filter[key] == null ? doc[key] == null : String(doc[key]) === String(filter[key])));

  return {
    ...extra,
    async get(filter = {}) {
      return { success: true, result: docs.filter((doc) => matches(doc, filter)).map((doc) => ({ ...doc })) };
    },
    async create(data) {
      events.push(["db-create", data]);
      const doc = { _id: `id-${docs.length + 1}`, ...data };
      docs.push(doc);
      return { success: true, result: { ...doc } };
    },
    async update(filter, newData) {
      events.push(["db-update", newData]);
      docs = docs.map((doc) => (matches(doc, filter) ? { ...doc, ...newData } : doc));
      return { success: true };
    },
    async updateExisting(filter, newData) {
      events.push(["db-update", newData]);
      const index = docs.findIndex((doc) => matches(doc, filter));
      if (index < 0) return { success: true, result: null };
      docs[index] = { ...docs[index], ...newData };
      return { success: true, result: { ...docs[index] } };
    },
    async delete(filter) {
      events.push(["db-delete", filter]);
      const before = docs.length;
      docs = docs.filter((doc) => !matches(doc, filter));
      return { success: true, result: { deletedCount: before - docs.length } };
    },
    snapshot: () => docs.map((doc) => ({ ...doc })),
  };
}

// Mirrors UploadFile/file.js: handleUpload resolves to null on any Drive
// failure instead of throwing, and handleDeleteByUrl never throws either.
function createDriveStorage(events, uploadResult) {
  return {
    async handleUpload(file, dbName, collection, tz) {
      events.push(["drive-upload", tz]);
      return uploadResult;
    },
    async handleDeleteByUrl(url) {
      events.push(["drive-delete", url]);
      return { deleted: true };
    },
  };
}

function runInVm(filename, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    process: { env: { DB_NAME: "tamheed_db" } },
    console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

// Load the real handlers with inert dependencies: importing the application
// normally initializes database, storage, email, and logging integrations.
function loadUserController(model, storage, audit = auditStub()) {
  return runInVm(path.join(__dirname, "../Entities/User/User.controller.js"), {
    ...audit.deps,
    ...require("./helpers/recycleBinStub").recycleBinStub().deps,
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": { UserModelDef: model },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    "../../utils/tourState": require("../utils/tourState"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
    "../../utils/systemPassword": require("../utils/systemPassword"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {},
    "../UploadFile/file": storage,
    "../Storage/Storage.controller": {},
    "../Notification/Notification.controller": {},
    ...require("./helpers/alertEventsStub").noopAlertDeps,
  });
}

function loadStudentController(model, storage, audit = auditStub(), consentCleanup = [], bin = require("./helpers/recycleBinStub").recycleBinStub(), consentModel = null, lessons = []) {
  return runInVm(path.join(__dirname, "../Entities/Student/Student.controller.js"), {
    ...audit.deps,
    ...bin.deps,
    "./Student.model": { StudentModelDef: model },
    "../Lesson/Lesson.model": { LessonModelDef: createModel(lessons, []) },
    "../User/User.model": { UserModelDef: createModel([], []) },
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../middleware/logger": { logWithSource() {} },
    "../UploadFile/file": storage,
    "../InviteToken/Rules.model": {
      ConsentModelDef: consentModel || {
        get: async (filter) => ({ success: true, result: [{ _id: "consent-1", studentId: filter.studentId }] }),
        delete: async (filter) => consentCleanup.push(["current", filter]),
      },
    },
    "../InviteToken/InviteToken.model": { InviteTokenModelDef: { delete: async (filter) => consentCleanup.push(["links", filter]) } },
    "../Notification/Notification.controller": {},
    ...require("./helpers/alertEventsStub").noopAlertDeps,
  });
}

function createRes() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const ENTITIES = [
  {
    name: "user",
    load(events, uploadResult) {
      const model = createModel(
        [{ tz: "123456782", firstname: "Example", photo: OLD_PHOTO }],
        events,
        { collections: { active: "Users" } }
      );
      const { uploadPhoto } = loadUserController(model, createDriveStorage(events, uploadResult));
      return { model, uploadPhoto };
    },
  },
  {
    name: "student",
    load(events, uploadResult) {
      const model = createModel(
        [{ tz: "123456782", firstname: "Example", photo: OLD_PHOTO }],
        events,
        { dbName: "tamheed_db", collections: { active: "Students" } }
      );
      const { uploadPhoto } = loadStudentController(model, createDriveStorage(events, uploadResult));
      return { model, uploadPhoto };
    },
  },
];

const photoUser = { tz: "123456782", roles: ["ادارة"] };
const photoRequest = () => ({
  params: { tz: "123456782" },
  user: photoUser,
  actor: actorFor(photoUser),
  file: { buffer: Buffer.from("image"), originalname: "photo.jpg", mimetype: "image/jpeg" },
});

for (const entity of ENTITIES) {
  test(`${entity.name} photo replacement keeps the current photo when the Drive upload fails`, async () => {
    const events = [];
    const { model, uploadPhoto } = entity.load(events, null);
    const res = createRes();

    await uploadPhoto(photoRequest(), res);

    assert.equal(res.body.ok, false);
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [["drive-upload", "123456782"]]);
    assert.equal(model.snapshot()[0].photo, OLD_PHOTO);
  });

  test(`${entity.name} photo replacement saves the new link before deleting the old Drive file`, async () => {
    const events = [];
    const { model, uploadPhoto } = entity.load(events, { secure_url: NEW_PHOTO, public_id: "new-file" });
    const res = createRes();
    live.passportJobs.length = 0;

    await uploadPhoto(photoRequest(), res);
    assert.deepEqual(live.passportJobs, [NEW_PHOTO], "the passport version is queued");

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.photo, NEW_PHOTO);
    const seen = JSON.parse(JSON.stringify(events));
    assert.deepEqual(seen, [
      ["drive-upload", "123456782"],
      ["db-update", { photo: NEW_PHOTO, updatedAt: seen[1][1].updatedAt }],
      ["drive-delete", OLD_PHOTO],
    ]);
    assert.equal(model.snapshot()[0].photo, NEW_PHOTO);
  });
}

// Loads the real Student router with the real permission middleware,
// recording each route's handler chain (router.use middleware first) instead
// of mounting it on an Express app. The request is already authenticated, and
// the actor is built from req.user as loadActor would from the database.
function loadStudentRoutes(controller) {
  const routes = [];
  const uses = [];
  const record = (method) => (routePath, ...handlers) => {
    routes.push({ method, path: routePath, handlers: [...uses, ...handlers] });
  };
  const router = {
    use(...handlers) { uses.push(...handlers); },
    get: record("get"),
    post: record("post"),
    put: record("put"),
    delete: record("delete"),
  };
  const multer = () => ({ single: () => (req, res, next) => next() });
  multer.memoryStorage = () => ({});

  runInVm(path.join(__dirname, "../Entities/Student/Student.route.js"), {
    express: { Router: () => router },
    multer,
    mongoose: {},
    "./Student.controller": controller,
    "./Student.model": { StudentModelDef: {} },
    "../../middleware/lockGuard": { requireFreeOrMine: () => (req, res, next) => next() },
    "../../middleware/authMiddleware": { requireAuth: (req, res, next) => next() },
    "../../middleware/permissionMiddleware": require("./helpers/actors").permissionMiddlewareStub(),
    "../../middleware/rateLimit": { rateLimit: () => (req, res, next) => next() },
  });
  return routes;
}

// Runs a route's handlers in order for an already-authenticated request,
// stopping at the first one that responds instead of calling next().
async function runRoute(route, req) {
  const res = createRes();
  for (const handler of route.handlers) {
    let proceeded = false;
    await handler(req, res, () => { proceeded = true; });
    if (!proceeded) break;
  }
  return res;
}

test("only admins can delete a student's photo", async () => {
  const cases = [
    { roles: ["ادارة"], allowed: true },
    { roles: ["مرشد"], allowed: false },
    { roles: ["مساعد"], allowed: false },
  ];

  for (const { roles, allowed } of cases) {
    let deleted = false;
    const noop = async () => {};
    const routes = loadStudentRoutes({
      getAllS: noop, getOneS: noop, lookupS: noop, putS: noop, deleteS: noop, postS: noop, uploadPhoto: noop,
      async deletePhoto(req, res) {
        deleted = true;
        res.status(200).json({ ok: true });
      },
    });
    const route = routes.find((r) => r.method === "delete" && r.path === "/photo/:tz");

    const res = await runRoute(route, { params: { tz: "123456782" }, user: { tz: "999", roles } });

    assert.equal(deleted, allowed, `roles ${roles.join(",")}`);
    assert.equal(res.statusCode, allowed ? 200 : 403, `roles ${roles.join(",")}`);
    if (!allowed) assert.equal(res.body?.code, "FORBIDDEN", `roles ${roles.join(",")}`);
  }
});

// The recycle bin (owner, 2026-11-16): the photo stays on Drive until the
// student is deleted for good from the bin.
test("deleting a student moves it to the recycle bin and keeps the photo until it is purged", async () => {
  const events = [];
  const model = createModel(
    [{ _id: "student-1", tz: "123456782", firstname: "Example", photo: OLD_PHOTO }],
    events,
    { dbName: "tamheed_db", collections: { active: "Students" } }
  );
  const cleanup = [];
  const bin = require("./helpers/recycleBinStub").recycleBinStub();
  const { deleteS, trashHooks } = loadStudentController(model, createDriveStorage(events, null), auditStub(), cleanup, bin);
  const res = createRes();
  const { forgotten } = require("./helpers/alertEventsStub");
  forgotten.length = 0;

  const admin = { tz: "123456782", roles: ["ادارة"] };
  await deleteS({ params: { tz: "123456782" }, user: admin, actor: actorFor(admin) }, res);

  assert.equal(res.statusCode, 200);
  // Its alerts go with it (owner, 2026-11-02).
  assert.deepEqual(forgotten, [["student", "student-1"]]);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    ["db-delete", { _id: "student-1", updatedAt: null }],
  ]);
  assert.equal(model.snapshot().length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(cleanup)), [
    ["current", { studentId: "student-1" }],    ["links", { purpose: "student-consent", studentId: "student-1" }],
  ]);
  assert.equal(res.body.trashId, "trash-1");
  assert.equal(bin.puts[0].kind, "student");
  assert.equal(bin.puts[0].refId, "student-1");
  assert.equal(bin.puts[0].data.photo, OLD_PHOTO);
  assert.equal(bin.puts[0].extras.consents[0]._id, "consent-1", "the parent's signature is kept with it");

  // Deleted for good from the bin: now the photo goes.
  assert.equal((await trashHooks.purge({ refId: "student-1", data: bin.puts[0].data })).failed, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(events)).at(-1), ["drive-delete", OLD_PHOTO]);
});

test("student create, edit, photo and delete are recorded in the audit log", async () => {
  const events = [];
  const model = createModel([], events, { dbName: "tamheed_db", collections: { active: "Students" } });
  const audit = auditStub();
  const controller = loadStudentController(model, createDriveStorage(events, { secure_url: NEW_PHOTO }), audit);
  const user = { tz: "123456782", roles: ["ادارة"] };
  const req = (extra) => ({ user, actor: actorFor(user), params: {}, body: {}, ...extra });

  const created = createRes();
  await controller.postS(req({ body: { status: "ينتظر", tz: "200000008", firstname: "Sam", lastname: "Example" } }), created);
  assert.equal(created.statusCode, 201);
  const id = model.snapshot()[0]._id;
  const [made] = audit.find({ module: "students", action: "create", targetId: id });
  assert.ok(made, "create recorded");
  assert.equal(made.targetType, "student");
  assert.equal(made.targetLabel, "Sam Example");

  await controller.putS(req({ params: { tz: "200000008" }, body: { firstname: "Samy" } }), createRes());
  const [edited] = audit.find({ module: "students", action: "update", targetId: id });
  assert.equal(edited.before.firstname, "Sam");
  assert.equal(edited.after.firstname, "Samy");

  await controller.uploadPhoto(req({ params: { tz: "200000008" }, file: { buffer: Buffer.from("x") } }), createRes());
  assert.ok(audit.calls.some((c) => c.action === "update" && c.after?.photo === NEW_PHOTO), "photo change recorded");

  const removed = createRes();
  await controller.deleteS(req({ params: { tz: "200000008" } }), removed);
  assert.equal(removed.statusCode, 200);
  const [deleted] = audit.find({ module: "students", action: "delete", targetId: id });
  assert.equal(deleted.before.firstname, "Samy");
  assert.equal(deleted.after, null);

  // A rejected request records nothing.
  const count = audit.calls.length;
  await controller.putS(req({ params: { tz: "300000007" }, body: { firstname: "X" } }), createRes());
  assert.equal(audit.calls.length, count);
});

// Codex review, 2026-11-18: a parent's signature is never lost on the way
// into or out of the recycle bin.
test("a student is not deleted when the copy of the parent's signature cannot be read", async () => {
  const events = [];
  const model = createModel([{ _id: "student-1", tz: "123456782", firstname: "Example" }], events, { dbName: "tamheed_db", collections: { active: "Students" } });
  const bin = require("./helpers/recycleBinStub").recycleBinStub();
  const consents = { get: async () => { throw new Error("read failed"); }, delete: async () => assert.fail("must not delete") };
  const { deleteS } = loadStudentController(model, createDriveStorage(events, null), auditStub(), [], bin, consents);
  const admin = { tz: "123456782", roles: ["ادارة"] };
  const res = createRes();
  await deleteS({ params: { tz: "123456782" }, user: admin, actor: actorFor(admin) }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "CONSENT_COPY_FAILED");
  assert.equal(model.snapshot().length, 1);
  assert.equal(bin.puts.length, 0);
});

test("a restore whose signature cannot be written back fails, leaves no student and removes nothing", async () => {
  const events = [];
  const model = createModel([], events, { dbName: "tamheed_db", collections: { active: "Students" } });
  const made = [];
  const undone = [];
  const consents = {
    create: async (c) => { if (c._id === "consent-2") throw new Error("write failed"); made.push(c._id); return { success: true, result: c }; },
    delete: async (filter) => undone.push(filter._id),
  };
  const { trashHooks } = loadStudentController(model, createDriveStorage(events, null), auditStub(), [], undefined, consents);
  const entry = { refId: "student-1", data: { _id: "student-1", tz: "123456782" }, extras: { consents: [{ _id: "consent-1" }, { _id: "consent-2" }] } };
  const result = await trashHooks.restore(entry);
  assert.equal(result.ok, false);
  assert.equal(result.code, "CONSENT_RESTORE_FAILED");
  assert.deepEqual(made, ["consent-1"]);
  assert.deepEqual(undone, [], "a written signature stays for the next try (Codex third re-review)");
  assert.equal(model.snapshot().length, 0, "the student never went live");
});

// Codex re-review, 2026-11-18: even when undoing fails too, the student is not
// live without its signature, and trying again works.
test("a restore that fails leaves no student, and a retry adopts the signature already written", async () => {
  const events = [];
  const model = createModel([], events, { dbName: "tamheed_db", collections: { active: "Students" } });
  const stored = new Map();
  let failSecond = true;
  const dup = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  const consents = {
    create: async (c) => {
      if (c._id === "consent-2" && failSecond) throw new Error("write failed");
      if (stored.has(c._id)) throw dup();
      stored.set(c._id, c);
      return { success: true, result: c };
    },
    delete: async () => { throw new Error("delete failed"); },
  };
  const { trashHooks } = loadStudentController(model, createDriveStorage(events, null), auditStub(), [], undefined, consents);
  const entry = { refId: "student-1", data: { _id: "student-1", tz: "123456782" }, extras: { consents: [{ _id: "consent-1" }, { _id: "consent-2" }] } };

  const first = await trashHooks.restore(entry);
  assert.equal(first.code, "CONSENT_RESTORE_FAILED");
  assert.equal(model.snapshot().length, 0, "no student without its signature");

  failSecond = false;
  const second = await trashHooks.restore(entry);
  assert.equal(second.ok, true);
  assert.equal(model.snapshot().length, 1);
  assert.deepEqual([...stored.keys()], ["consent-1", "consent-2"]);
});

test("deleting for good from the bin removes a signature left behind by a failed restore", async () => {
  const model = createModel([], [], { dbName: "tamheed_db", collections: { active: "Students" } });
  const removed = [];
  const consents = { delete: async (filter) => removed.push(filter) };
  const { trashHooks } = loadStudentController(model, createDriveStorage([], null), auditStub(), [], undefined, consents);
  const result = await trashHooks.purge({ refId: "student-1", data: { _id: "student-1" }, extras: { consents: [{ _id: "consent-1" }] } });
  assert.equal(result.failed, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(removed)), [{ studentId: "student-1" }]);
});

// Codex re-review, 2026-11-18.
test("two restores at once: the one that loses keeps the signature the winner adopted", async () => {
  const model = createModel([], [], { dbName: "tamheed_db", collections: { active: "Students" } });
  const undone = [];
  const consents = { create: async (c) => ({ success: true, result: c }), delete: async (f) => undone.push(f._id) };
  // The other restore put the student back between the check and the insert.
  model.create = async () => {
    model.get = async (filter) => ({ success: true, result: filter._id ? [{ _id: "student-1" }] : [] });
    throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  };
  const { trashHooks } = loadStudentController(model, createDriveStorage([], null), auditStub(), [], undefined, consents);
  const entry = { refId: "student-1", data: { _id: "student-1", tz: "123456782" }, extras: { consents: [{ _id: "consent-1" }] } };
  const result = await trashHooks.restore(entry);
  assert.equal(result.code, "TZ_EXISTS");
  assert.deepEqual(undone, [], "the live student's signature stays");
});

test("a purge whose student cannot be read removes nothing and keeps the bin row", async () => {
  const model = createModel([], [], { dbName: "tamheed_db", collections: { active: "Students" } });
  model.get = async () => { throw new Error("db down"); };
  const events = [];
  const consents = { delete: async () => assert.fail("must not delete a signature") };
  const { trashHooks } = loadStudentController(model, createDriveStorage(events, null), auditStub(), [], undefined, consents);
  const result = await trashHooks.purge({ refId: "student-1", data: { _id: "student-1", photo: OLD_PHOTO }, extras: { consents: [{ _id: "consent-1" }] } });
  assert.equal(result.failed, 1);
  assert.equal(events.filter((e) => e[0] === "drive-delete").length, 0, "the photo stays too");
});

// Codex third re-review, 2026-11-18: A writes the signature, B adopts it, A
// fails on a passing error, B puts the student back. The signature stays.
test("a restore that fails on a passing error never removes a signature another restore adopted", async () => {
  const model = createModel([], [], { dbName: "tamheed_db", collections: { active: "Students" } });
  const realCreate = model.create.bind(model);
  let failA = true;
  model.create = async (data) => {
    if (failA) { failA = false; throw new Error("passing error"); }
    return realCreate(data);
  };
  const stored = new Map();
  const consents = {
    create: async (c) => {
      if (stored.has(c._id)) throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      stored.set(c._id, c);
      return { success: true, result: c };
    },
    deletes: [],
    async delete(f) { this.deletes.push(f._id); stored.delete(f._id); },
  };
  const { trashHooks } = loadStudentController(model, createDriveStorage([], null), auditStub(), [], undefined, consents);
  const entry = { refId: "student-1", data: { _id: "student-1", tz: "123456782" }, extras: { consents: [{ _id: "consent-1" }] } };
  await assert.rejects(() => trashHooks.restore(entry), /passing error/);
  // B may already have adopted it, so A deletes nothing.
  assert.deepEqual(consents.deletes, []);
  const b = await trashHooks.restore(entry);
  assert.equal(b.ok, true);
  assert.equal(model.snapshot().length, 1);
  assert.ok(stored.has("consent-1"), "the live student keeps its signature");
});

test("a restore whose student cannot be written keeps the signatures for the next try", async () => {
  const events = [];
  const model = createModel([], events, { dbName: "tamheed_db", collections: { active: "Students" } });
  model.create = async () => { throw new Error("student write failed"); };
  const undone = [];
  const consents = {
    create: async (c) => ({ success: true, result: c }),
    delete: async (filter) => undone.push(filter._id),
  };
  const { trashHooks } = loadStudentController(model, createDriveStorage(events, null), auditStub(), [], undefined, consents);
  const entry = { refId: "student-1", data: { _id: "student-1", tz: "123456782" }, extras: { consents: [{ _id: "consent-1" }] } };
  await assert.rejects(() => trashHooks.restore(entry), /student write failed/);
  assert.deepEqual(undone, []);
});

// Codex review, 2026-11-18: the bin shows a guide only their own students.
test("the recycle bin shows a deleted student only to whoever could see it", async () => {
  const model = createModel([], [], { dbName: "tamheed_db", collections: { active: "Students" } });
  const lessons = [{ _id: "L1", teacher: "guide-1", list_students: ["in-lesson"] }];
  const { trashHooks } = loadStudentController(model, createDriveStorage([], null), auditStub(), [], undefined, null, lessons);
  const guide = { actor: { id: "guide-1", tz: "1", permissions: new Set(["students.view", "students.delete"]) } };
  const manager = { actor: { id: "m-1", tz: "2", permissions: new Set(["students.viewAll", "students.delete"]) } };
  const entry = (refId, mainTeacher) => ({ refId, data: { _id: refId, main_teacher: mainTeacher } });
  assert.equal(await trashHooks.visible(entry("mine", "guide-1"), guide), true);
  assert.equal(await trashHooks.visible(entry("in-lesson", "other-guide"), { ...guide }), true);
  assert.equal(await trashHooks.visible(entry("other", "other-guide"), { ...guide }), false);
  assert.equal(await trashHooks.visible(entry("other", "other-guide"), manager), true);
});
