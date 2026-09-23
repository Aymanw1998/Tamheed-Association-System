const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

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
    async update(filter, newData) {
      events.push(["db-update", newData]);
      docs = docs.map((doc) => (matches(doc, filter) ? { ...doc, ...newData } : doc));
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
function loadUserController(model, storage) {
  return runInVm(path.join(__dirname, "../Entities/User/User.controller.js"), {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": { UserModelDef: model },
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {},
    "../UploadFile/file": storage,
    "../Storage/Storage.controller": {},
    "../Notification/Notification.controller": {},
  });
}

function loadStudentController(model, storage) {
  return runInVm(path.join(__dirname, "../Entities/Student/Student.controller.js"), {
    "./Student.model": { StudentModelDef: model },
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

const photoRequest = () => ({
  params: { tz: "123456782" },
  user: { tz: "123456782", roles: ["ادارة"] },
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

// Loads the real Student router with the real role middleware, recording
// each route's handler chain instead of mounting it on an Express app.
function loadStudentRoutes(controller) {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => {
    routes.push({ method, path: routePath, handlers });
  };
  const router = {
    use() {},
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
    "../../middleware/authMiddleware": require("../middleware/authMiddleware"),
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
      getAllS: noop, getOneS: noop, putS: noop, deleteS: noop, postS: noop, uploadPhoto: noop,
      async deletePhoto(req, res) {
        deleted = true;
        res.status(200).json({ ok: true });
      },
    });
    const route = routes.find((r) => r.method === "delete" && r.path === "/photo/:tz");

    const res = await runRoute(route, { params: { tz: "123456782" }, user: { tz: "999", roles } });

    assert.equal(deleted, allowed, `roles ${roles.join(",")}`);
    assert.equal(res.statusCode, allowed ? 200 : 403, `roles ${roles.join(",")}`);
  }
});
