const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const RECEIVED = "تم استلام الطلب، سنتواصل معكم قريبًا";
const VALID_TZ = "123456782"; // check digit: 1+4+3+8+5+3+7+7+2 = 40
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const plain = (value) => JSON.parse(JSON.stringify(value));

// In-memory stand-in for the generic Mongo-backed model CRUD. `update`
// upserts like server/Entities/api.js does.
function createModel(records = [], extra = {}) {
  let nextId = 0;
  let docs = records.map((record) => ({ _id: `doc-${nextId++}`, ...record }));
  const matches = (doc, filter = {}) =>
    Object.keys(filter).every((key) => String(doc[key]) === String(filter[key]));

  return {
    ...extra,
    async get(filter = {}) {
      return { success: true, result: docs.filter((doc) => matches(doc, filter)).map((doc) => ({ ...doc })) };
    },
    async create(data) {
      const doc = { _id: `doc-${nextId++}`, ...data };
      docs.push(doc);
      return { success: true, result: { ...doc } };
    },
    async update(filter, newData) {
      if (!docs.some((doc) => matches(doc, filter))) {
        docs.push({ _id: `doc-${nextId++}`, ...filter, ...newData });
      } else {
        docs = docs.map((doc) => (matches(doc, filter) ? { ...doc, ...newData } : doc));
      }
      return { success: true };
    },
    async delete(filter) {
      docs = docs.filter((doc) => !matches(doc, filter));
      return { success: true };
    },
    snapshot: () => docs.map((doc) => ({ ...doc })),
  };
}

function runInVm(filename, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    Buffer,
    process: { env: {} },
    console: { log() {}, warn() {}, error() {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

// Loads the real controller with in-memory models and a fake Drive.
function loadController({ students = [], attempts = [], uploadResult = null } = {}) {
  const models = {
    students: createModel(students, { dbName: "tamheed_db", collections: { active: "Students" } }),
    links: createModel(),
    attempts: createModel(attempts),
  };
  const drive = {
    uploads: [],
    async handleUpload(file, dbName, collection, tz) {
      drive.uploads.push({ dbName, collection, tz, name: file.originalname });
      return uploadResult;
    },
  };
  const controller = runInVm(path.join(__dirname, "../Entities/InviteToken/InviteToken.controller.js"), {
    crypto: require("node:crypto"),
    "./InviteToken.model": { InviteTokenModelDef: models.links },
    "./RegistrationAttempt.model": { RegistrationAttemptModelDef: models.attempts },
    "../Student/Student.model": { StudentModelDef: models.students },
    "../UploadFile/file": drive,
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/israeliId": require("../utils/israeliId"),
  });
  return { ...controller, models, drive };
}

function createRes() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    set() { return this; },
  };
}

async function call(handler, req = {}) {
  const res = createRes();
  await handler({ params: {}, body: {}, ...req }, res);
  return res;
}

const currentToken = async (ctrl) => (await call(ctrl.getLink)).body.token;

test("the registration link keeps its token until an admin rotates it", async () => {
  const ctrl = loadController();
  const first = await currentToken(ctrl);

  assert.match(first, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(await currentToken(ctrl), first);

  const rotated = (await call(ctrl.rotateLink)).body.token;
  assert.notEqual(rotated, first);
  assert.equal((await call(ctrl.validateToken, { params: { token: first } })).statusCode, 404);
  assert.deepEqual(plain((await call(ctrl.validateToken, { params: { token: rotated } })).body), { valid: true, open: true });
});

test("a wrong or missing token is not valid", async () => {
  const ctrl = loadController();
  await currentToken(ctrl);
  for (const token of ["guess", "", undefined]) {
    const res = await call(ctrl.validateToken, { params: { token } });
    assert.equal(res.statusCode, 404, String(token));
    assert.deepEqual(plain(res.body), { valid: false });
  }
});

test("admins see this week's parent requests and only the last 30 days of refused ones, newest first", async () => {
  const ctrl = loadController({
    students: [
      { tz: "900000001", source: "اهل", status: "ينتظر", createdAt: daysAgo(1) },
      { tz: "900000002", source: "اهل", status: "عادي", createdAt: daysAgo(6) },
      { tz: "900000003", source: "اهل", status: "عادي", createdAt: daysAgo(8) },
      { tz: "900000004", source: "جمعية", status: "عادي", createdAt: daysAgo(1) },
    ],
    attempts: [
      { tz: "800000003", reason: "exists", createdAt: daysAgo(3) },
      { tz: "800000040", reason: "exists", createdAt: daysAgo(40) },
      { tz: "800000001", reason: "pending", createdAt: daysAgo(1) },
    ],
  });

  const body = plain((await call(ctrl.getLink)).body);

  assert.equal(body.usedThisWeek, 2);
  assert.equal(body.weeklyLimit, 30);
  assert.deepEqual(body.attempts.map((a) => [a.tz, a.reason]), [["800000001", "pending"], ["800000003", "exists"]]);
});

const registration = (overrides = {}) => ({
  tz: VALID_TZ,
  firstname: "طفل",
  lastname: "تجريبي",
  gender: "ذكر",
  birth_date: "2015-03-01",
  phone: "+972500000000",
  father_name: "أب",
  mother_name: "أم",
  father_phone: "+972500000001",
  mother_phone: "+972500000002",
  ...overrides,
});

const photoFile = () => ({ buffer: Buffer.from("image"), originalname: "child.jpg", mimetype: "image/jpeg" });

test("a parent request joins the waiting list with server-set status and source", async () => {
  const ctrl = loadController();
  const token = await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, {
    params: { token },
    body: registration({ status: "عادي", source: "جمعية", main_teacher: "guide-1", photo: "https://example.com/x.png" }),
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(plain(res.body), { ok: true, message: RECEIVED });
  const [student] = ctrl.models.students.snapshot();
  assert.equal(student.tz, VALID_TZ);
  assert.equal(student.firstname, "طفل");
  assert.equal(student.father_phone, "+972500000001");
  assert.equal(student.status, "ينتظر");
  assert.equal(student.source, "اهل");
  assert.equal(student.main_teacher, null);
  assert.equal(student.photo, "");
});

test("a known ID number gets the same reply, is not saved again, and is listed for staff", async () => {
  for (const { status, reason } of [{ status: "عادي", reason: "exists" }, { status: "ينتظر", reason: "pending" }]) {
    const ctrl = loadController({
      students: [{ tz: VALID_TZ, firstname: "قديم", status, source: "جمعية", createdAt: daysAgo(40) }],
    });
    const token = await currentToken(ctrl);

    const res = await call(ctrl.submitRegistration, { params: { token }, body: registration(), file: photoFile() });

    assert.equal(res.statusCode, 200, status);
    assert.deepEqual(plain(res.body), { ok: true, message: RECEIVED }, status);
    assert.deepEqual(ctrl.models.students.snapshot().map((s) => s.firstname), ["قديم"], status);
    assert.deepEqual(ctrl.drive.uploads, [], status);
    const attempts = plain((await call(ctrl.getLink)).body.attempts);
    assert.deepEqual(attempts.map((a) => [a.tz, a.reason, a.father_phone]), [[VALID_TZ, reason, "+972500000001"]], status);
  }
});

test("the link stops accepting requests after 30 parent requests in 7 days", async () => {
  const recent = Array.from({ length: 30 }, (_, i) => ({
    tz: `90000${String(i).padStart(4, "0")}`, source: "اهل", status: "ينتظر", createdAt: daysAgo(6),
  }));
  const ctrl = loadController({ students: recent });
  const token = await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, { params: { token }, body: registration() });

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "INTAKE_CLOSED");
  assert.equal(ctrl.models.students.snapshot().length, 30);
  assert.deepEqual(plain((await call(ctrl.validateToken, { params: { token } })).body), { valid: true, open: false });
});

test("older parent requests and staff-added students do not count toward the weekly limit", async () => {
  const students = [
    ...Array.from({ length: 30 }, (_, i) => ({ tz: `80000${String(i).padStart(4, "0")}`, source: "اهل", status: "عادي", createdAt: daysAgo(8) })),
    ...Array.from({ length: 5 }, (_, i) => ({ tz: `70000${String(i).padStart(4, "0")}`, source: "جمعية", status: "عادي", createdAt: daysAgo(1) })),
  ];
  const ctrl = loadController({ students });
  const token = await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, { params: { token }, body: registration() });

  assert.equal(res.statusCode, 200);
  assert.equal((await call(ctrl.getLink)).body.usedThisWeek, 1);
});

test("invalid ID numbers and missing names are rejected without saving", async () => {
  for (const overrides of [{ tz: "123456789" }, { tz: "abc" }, { firstname: "" }, { lastname: "   " }]) {
    const ctrl = loadController();
    const token = await currentToken(ctrl);

    const res = await call(ctrl.submitRegistration, { params: { token }, body: registration(overrides) });

    assert.equal(res.statusCode, 400, JSON.stringify(overrides));
    assert.equal(res.body.ok, false);
    assert.equal(ctrl.models.students.snapshot().length, 0, JSON.stringify(overrides));
  }
});

test("a submission with a wrong token saves nothing", async () => {
  const ctrl = loadController();
  await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, { params: { token: "guess" }, body: registration() });

  assert.equal(res.statusCode, 404);
  assert.equal(ctrl.models.students.snapshot().length, 0);
});

test("the photo is saved to the students' Drive folder and linked to the request", async () => {
  const photo = "https://lh3.googleusercontent.com/d/child-photo";
  const ctrl = loadController({ uploadResult: { secure_url: photo, public_id: "child-photo" } });
  const token = await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, { params: { token }, body: registration(), file: photoFile() });

  assert.deepEqual(plain(res.body), { ok: true, message: RECEIVED });
  assert.deepEqual(ctrl.drive.uploads, [{ dbName: "tamheed_db", collection: "Students", tz: VALID_TZ, name: "child.jpg" }]);
  assert.equal(ctrl.models.students.snapshot()[0].photo, photo);
});

test("a failed photo upload keeps the request, without a photo and with the same reply", async () => {
  const ctrl = loadController({ uploadResult: null });
  const token = await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, { params: { token }, body: registration(), file: photoFile() });

  assert.deepEqual(plain(res.body), { ok: true, message: RECEIVED });
  assert.equal(ctrl.models.students.snapshot()[0].photo, "");
});

test("only the newest 100 refused requests are kept", async () => {
  const attempts = Array.from({ length: 100 }, (_, i) => ({ tz: `60000${String(i).padStart(4, "0")}`, reason: "exists", createdAt: daysAgo(1 + i / 10) }));
  const ctrl = loadController({ students: [{ tz: VALID_TZ, status: "عادي", source: "جمعية", createdAt: daysAgo(90) }], attempts });
  const token = await currentToken(ctrl);

  await call(ctrl.submitRegistration, { params: { token }, body: registration() });

  const kept = ctrl.models.attempts.snapshot();
  assert.equal(kept.length, 100);
  assert.ok(kept.some((a) => a.tz === VALID_TZ));
  assert.ok(!kept.some((a) => a.tz === "600000099"));
});

process.env.JWT_ACCESS_SECRET = "test-access-secret";
const jwt = require("jsonwebtoken");

const bearer = (roles) =>
  `Bearer ${jwt.sign({ id: "user-1", tz: "111111118", roles }, process.env.JWT_ACCESS_SECRET, { algorithm: "HS256" })}`;

const routeRequest = ({ roles = null, ip = "198.51.100.1", params = {} } = {}) => ({
  params,
  body: {},
  ip,
  headers: roles ? { authorization: bearer(roles) } : {},
  get(name) { return this.headers[String(name).toLowerCase()]; },
});

// Loads the real router with the real auth and rate-limit middleware,
// recording each route's handler chain instead of mounting it.
function loadRoutes({ multerError = null } = {}) {
  const routes = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers });
  const router = { get: record("get"), post: record("post"), put: record("put"), delete: record("delete"), use() {} };
  const multerOptions = [];
  const multer = (options) => {
    multerOptions.push(options);
    return { single: () => (req, res, next) => next(multerError) };
  };
  multer.memoryStorage = () => ({});
  const calls = [];
  const handler = (name) => async (req, res) => {
    calls.push(name);
    res.status(200).json({ ok: true });
  };

  runInVm(path.join(__dirname, "../Entities/InviteToken/InviteToken.route.js"), {
    express: { Router: () => router },
    multer,
    "./InviteToken.controller": {
      getLink: handler("getLink"),
      rotateLink: handler("rotateLink"),
      validateToken: handler("validateToken"),
      submitRegistration: handler("submitRegistration"),
    },
    "../../middleware/authMiddleware": require("../middleware/authMiddleware"),
    "../../middleware/rateLimit": require("../middleware/rateLimit"),
  });
  const find = (method, routePath) => routes.find((r) => r.method === method && r.path === routePath);
  return { find, calls, multerOptions };
}

async function runRoute(route, req) {
  const res = createRes();
  for (const handler of route.handlers) {
    let proceeded = false;
    await handler(req, res, (err) => { proceeded = !err; });
    if (!proceeded) break;
  }
  return res;
}

test("only admins can view or rotate the registration link", async () => {
  const cases = [
    { roles: ["ادارة"], status: 200 },
    { roles: ["مرشد"], status: 403 },
    { roles: ["مساعد"], status: 403 },
    { roles: null, status: 401 },
  ];
  for (const [method, routePath, name] of [["get", "/link", "getLink"], ["post", "/link/rotate", "rotateLink"]]) {
    for (const { roles, status } of cases) {
      const { find, calls } = loadRoutes();
      const res = await runRoute(find(method, routePath), routeRequest({ roles }));
      assert.equal(res.statusCode, status, `${name} as ${roles}`);
      assert.deepEqual(calls, status === 200 ? [name] : [], `${name} as ${roles}`);
    }
  }
});

test("one device can send at most 3 registration requests per hour", async () => {
  const { find, calls } = loadRoutes();
  const route = find("post", "/submit/:token");
  const statuses = [];
  for (let i = 0; i < 4; i++) {
    statuses.push((await runRoute(route, routeRequest({ ip: "203.0.113.7", params: { token: "t" } }))).statusCode);
  }
  assert.deepEqual(statuses, [200, 200, 200, 429]);
  assert.equal(calls.length, 3);
});

test("the registration photo must be a JPG, PNG or WEBP of at most 5MB", async () => {
  const [options] = loadRoutes().multerOptions;
  assert.equal(options.limits.fileSize, 5 * 1024 * 1024);
  const accepts = (mimetype) =>
    new Promise((resolve) => options.fileFilter({}, { mimetype }, (err, ok) => resolve(!err && ok)));
  assert.deepEqual(
    await Promise.all(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"].map(accepts)),
    [true, true, true, false, false]
  );
});

test("a refused registration photo gets an Arabic 400 instead of a server error", async () => {
  const { find, calls } = loadRoutes({ multerError: new Error("File too large") });
  const res = await runRoute(find("post", "/submit/:token"), routeRequest({ ip: "203.0.113.8", params: { token: "t" } }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "BAD_PHOTO");
  assert.equal(res.body.message, "الصورة يجب أن تكون JPG أو PNG أو WEBP وحتى 5MB");
  assert.deepEqual(calls, []);
});
