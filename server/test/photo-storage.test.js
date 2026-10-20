const assert = require("node:assert/strict");
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
    Object.keys(filter).every((key) => String(doc[key]) === String(filter[key]));

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
    async delete(filter) {
      events.push(["db-delete", filter]);
      docs = docs.filter((doc) => !matches(doc, filter));
      return { success: true };
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
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": { UserModelDef: model },
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
    "../../utils/systemPassword": require("../utils/systemPassword"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {},
    "../UploadFile/file": storage,
    "../Storage/Storage.controller": {},
    "../Notification/Notification.controller": {},
  });
}

function loadStudentController(model, storage, audit = auditStub()) {
  return runInVm(path.join(__dirname, "../Entities/Student/Student.controller.js"), {
    ...audit.deps,
    "./Student.model": { StudentModelDef: model },
    "../Lesson/Lesson.model": { LessonModelDef: createModel([], []) },
    "../User/User.model": { UserModelDef: createModel([], []) },
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../middleware/logger": { logWithSource() {} },
    "../UploadFile/file": storage,
    "../Notification/Notification.controller": {},
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

    await uploadPhoto(photoRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.photo, NEW_PHOTO);
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [
      ["drive-upload", "123456782"],
      ["db-update", { photo: NEW_PHOTO }],
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

test("only admins and guides can delete a student's photo", async () => {
  const cases = [
    { roles: ["ادارة"], allowed: true },
    { roles: ["مرشد"], allowed: true },
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

test("deleting a student also deletes their photo from Drive", async () => {
  const events = [];
  const model = createModel(
    [{ _id: "student-1", tz: "123456782", firstname: "Example", photo: OLD_PHOTO }],
    events,
    { dbName: "tamheed_db", collections: { active: "Students" } }
  );
  const { deleteS } = loadStudentController(model, createDriveStorage(events, null));
  const res = createRes();

  const admin = { tz: "123456782", roles: ["ادارة"] };
  await deleteS({ params: { tz: "123456782" }, user: admin, actor: actorFor(admin) }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    ["db-delete", { _id: "student-1" }],
    ["drive-delete", OLD_PHOTO],
  ]);
  assert.equal(model.snapshot().length, 0);
});

test("student create, edit, photo and delete are recorded in the audit log", async () => {
  const events = [];
  const model = createModel([], events, { dbName: "tamheed_db", collections: { active: "Students" } });
  const audit = auditStub();
  const controller = loadStudentController(model, createDriveStorage(events, { secure_url: NEW_PHOTO }), audit);
  const user = { tz: "123456782", roles: ["ادارة"] };
  const req = (extra) => ({ user, actor: actorFor(user), params: {}, body: {}, ...extra });

  const created = createRes();
  await controller.postS(req({ body: { tz: "200000008", firstname: "Sam", lastname: "Example" } }), created);
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
