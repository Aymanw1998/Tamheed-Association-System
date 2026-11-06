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
const live = require("./helpers/liveStubs");

// In-memory stand-in for the generic Mongo-backed model CRUD. `update`
// upserts like server/Entities/api.js does.
function createModel(records = [], extra = {}) {
  let nextId = 0;
  let docs = records.map((record) => ({ _id: `doc-${nextId++}`, ...record }));
  const matches = (doc, filter = {}) =>
    Object.keys(filter).every((key) => filter[key] == null ? doc[key] == null : String(doc[key]) === String(filter[key]));

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
    async updateExisting(filter, newData) {
      const index = docs.findIndex((doc) => matches(doc, filter));
      if (index < 0) return { success: true, result: null };
      docs[index] = { ...docs[index], ...newData };
      return { success: true, result: { ...docs[index] } };
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
function loadController({ students = [], rules = [{ version: 1, text: "the rules" }], uploadResult = null, extraDeps = {} } = {}) {
  const models = {
    students: createModel(students, { dbName: "tamheed_db", collections: { active: "Students" } }),
    links: createModel(),
    rules: createModel(rules),
    consents: createModel(),
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
    "./defaultRules": require("../Entities/InviteToken/defaultRules"),
    "./InviteToken.model": { InviteTokenModelDef: models.links },
    "./Rules.model": { RulesModelDef: models.rules, ConsentModelDef: models.consents },
    "../../utils/grades": require("../utils/grades"),
    "../Student/Student.model": { StudentModelDef: models.students },
    "../UploadFile/file": drive,
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/israeliId": require("../utils/israeliId"),
    ...require("./helpers/alertEventsStub").noopAlertDeps,
    ...live.deps,
    ...extraDeps,
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
  { const seen = (await call(ctrl.validateToken, { params: { token: rotated } })).body; assert.equal(seen.valid, true); assert.equal(seen.open, true); }
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

test("admins see this month's parent requests", async () => {
  const ctrl = loadController({
    students: [
      { tz: "900000001", source: "اهل", status: "ينتظر", createdAt: daysAgo(1) },
      { tz: "900000002", source: "اهل", status: "عادي", createdAt: daysAgo(6) },
      { tz: "900000003", source: "اهل", status: "عادي", createdAt: daysAgo(31) },
      { tz: "900000004", source: "جمعية", status: "عادي", createdAt: daysAgo(1) },
    ],
  });

  const body = plain((await call(ctrl.getLink)).body);

  assert.equal(body.usedThisMonth, 2);
  assert.equal(body.monthlyLimit, 30);
  assert.equal(body.attempts, undefined);
});

const registration = (overrides = {}) => ({
  rulesVersion: "1", rulesAccepted: "true", signerName: "Parent", signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
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

test("a known ID number gets the same reply and nothing is saved", async () => {
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
  }
});

test("the link stops accepting requests after 30 parent requests in 30 days, whatever the address", async () => {
  const recent = Array.from({ length: 30 }, (_, i) => ({
    tz: `90000${String(i).padStart(4, "0")}`, source: "اهل", status: "ينتظر", createdAt: daysAgo(6),
  }));
  const ctrl = loadController({ students: recent });
  const token = await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, { params: { token }, body: registration() });

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "INTAKE_CLOSED");
  assert.equal(ctrl.models.students.snapshot().length, 30);
  { const seen = (await call(ctrl.validateToken, { params: { token } })).body; assert.equal(seen.valid, true); assert.equal(seen.open, false); }
});

test("older parent requests and staff-added students do not count toward the monthly limit", async () => {
  const students = [
    ...Array.from({ length: 30 }, (_, i) => ({ tz: `80000${String(i).padStart(4, "0")}`, source: "اهل", status: "عادي", createdAt: daysAgo(31) })),
    ...Array.from({ length: 5 }, (_, i) => ({ tz: `70000${String(i).padStart(4, "0")}`, source: "جمعية", status: "عادي", createdAt: daysAgo(1) })),
  ];
  const ctrl = loadController({ students });
  const token = await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, { params: { token }, body: registration() });

  assert.equal(res.statusCode, 200);
  assert.equal((await call(ctrl.getLink)).body.usedThisMonth, 1);
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

test("a parent request and its photo are announced to open staff screens", async () => {
  const ctrl = loadController({ uploadResult: { secure_url: "https://x.test/p", public_id: "p" } });
  const token = await currentToken(ctrl);
  live.changes.length = 0;
  await call(ctrl.submitRegistration, { params: { token }, body: registration(), file: photoFile() });
  const id = ctrl.models.students.snapshot()[0]._id;
  assert.deepEqual(live.changes, [["student", id], ["student", id]]);
});

test("a failed photo upload keeps the request, without a photo and with the same reply", async () => {
  const ctrl = loadController({ uploadResult: null });
  const token = await currentToken(ctrl);

  const res = await call(ctrl.submitRegistration, { params: { token }, body: registration(), file: photoFile() });

  assert.deepEqual(plain(res.body), { ok: true, message: RECEIVED });
  assert.equal(ctrl.models.students.snapshot()[0].photo, "");
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
    "../../middleware/permissionMiddleware": require("./helpers/actors").permissionMiddlewareStub(),
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

test("one address has no limit of its own on registration requests", async () => {
  const { find, calls } = loadRoutes();
  const route = find("post", "/submit/:token");
  const statuses = [];
  for (let i = 0; i < 29; i++) {
    statuses.push((await runRoute(route, routeRequest({ ip: "203.0.113.7", params: { token: "t" } }))).statusCode);
  }
  assert.ok(statuses.every((status) => status === 200));
  assert.equal(calls.length, 29);
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

/* ---------------- smart-assistant alert ---------------- */

test("a new parent request raises parent_registration; a known ID or a failing alert changes nothing", async () => {
  const calls = [];
  const alerts = (fail) => ({ "../../services/alertEvents": {
    async parentRegistered(student) { calls.push(JSON.parse(JSON.stringify(student))); if (fail) throw new Error("alerts down"); },
  } });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const ctrl = loadController({ extraDeps: alerts(false) });
  const res = await call(ctrl.submitRegistration, { params: { token: await currentToken(ctrl) }, body: registration() });
  await flush();
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].firstname, "طفل");
  assert.ok(calls[0]._id, "the alert links to the saved request");

  const known = loadController({ students: [{ tz: VALID_TZ, status: "ينتظر", source: "اهل" }], extraDeps: alerts(false) });
  await call(known.submitRegistration, { params: { token: await currentToken(known) }, body: registration() });
  await flush();
  assert.equal(calls.length, 1, "a known ID raises nothing");

  const failing = loadController({ extraDeps: alerts(true) });
  const ok = await call(failing.submitRegistration, { params: { token: await currentToken(failing) }, body: registration() });
  await flush();
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(plain(ok.body), { ok: true, message: RECEIVED });
});

const RULES = { version: 2, text: "the rules" };
const SIGNED = { rulesVersion: "2", rulesAccepted: "true", signerName: "Parent", signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" };

test("an explicitly empty published version closes the link", async () => {
  for (const rules of [[{ version: 1, text: "" }]]) {
    const ctrl = loadController({ rules });
    const token = await currentToken(ctrl);
    const open = (await call(ctrl.validateToken, { params: { token } })).body;
    assert.equal(open.open, false);
    assert.equal(open.noRules, true);
    const res = await call(ctrl.submitRegistration, { params: { token }, body: registration() });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "NO_RULES");
    assert.equal(ctrl.models.students.snapshot().length, 0);
  }
});

test("sending the same child twice answers the same both times and adds no second request", async () => {
  const ctrl = loadController();
  const token = await currentToken(ctrl);
  const first = await call(ctrl.submitRegistration, { params: { token }, body: registration() });
  const again = await call(ctrl.submitRegistration, { params: { token }, body: registration() });
  assert.equal(first.statusCode, 200);
  assert.equal(again.statusCode, 200);
  assert.deepEqual(plain(again.body), plain(first.body));
  assert.equal(ctrl.models.students.snapshot().length, 1);
  assert.equal(ctrl.models.consents.snapshot().length, 1);
});

test("a parent's request counts as signed; a student the association added signs later, once", async () => {
  const ctrl = loadController({ students: [{ tz: "1", status: "عادي" }] });
  const token = await currentToken(ctrl);
  await call(ctrl.submitRegistration, { params: { token }, body: registration() });
  const parents = ctrl.models.students.snapshot().find((s) => s.tz === VALID_TZ);
  assert.ok(parents.consentAt);
  const added = ctrl.models.students.snapshot().find((s) => s.tz === "1");
  assert.equal(added.consentAt, undefined);
  const params = { studentId: String(added._id) };
  const { rulesVersion, rulesAccepted, signerName, signature } = registration();
  const missing = await call(ctrl.signConsent, { params, body: { rulesVersion, rulesAccepted } });
  assert.equal(missing.statusCode, 400);
  const signed = await call(ctrl.signConsent, { params, body: { rulesVersion, rulesAccepted, signerName, signature }, actor: { firstname: "Staff", lastname: "One" } });
  assert.equal(signed.statusCode, 200);
  assert.ok(ctrl.models.students.snapshot().find((s) => s.tz === "1").consentAt);
  assert.equal((await call(ctrl.getConsent, { params })).body.consent.signerName, "Parent");
  const twice = await call(ctrl.signConsent, { params, body: { rulesVersion, rulesAccepted, signerName, signature } });
  assert.equal(twice.statusCode, 409);
  assert.equal(twice.body.code, "ALREADY_SIGNED");
  assert.equal((await call(ctrl.signConsent, { params: { studentId: "gone" }, body: { rulesVersion, rulesAccepted, signerName, signature } })).statusCode, 404);
});

test("the form gets the latest rules; missing approval/name and malformed stamps store nothing", async () => {
  const ctrl = loadController({ rules: [{ version: 1, text: "old" }, RULES] });
  const token = await currentToken(ctrl);
  assert.deepEqual(plain((await call(ctrl.validateToken, { params: { token } })).body.rules), RULES);
  for (const missing of ["rulesAccepted", "signerName"]) {
    const body = { ...registration(), ...SIGNED };
    delete body[missing];
    const res = await call(ctrl.submitRegistration, { params: { token }, body });
    assert.equal(res.statusCode, 400, missing);
    assert.equal(res.body.code, "CONSENT_REQUIRED");
  }
  for (const signature of ["javascript:alert(1)", "data:image/png;base64,AAAA"]) {
    const bad = await call(ctrl.submitRegistration, { params: { token }, body: { ...registration(), ...SIGNED, signature } });
    assert.equal(bad.statusCode, 400, signature);
  }
  assert.equal(ctrl.models.students.snapshot().length, 0);
  assert.equal(ctrl.models.consents.snapshot().length, 0);
});

test("a form opened before the rules changed must sign again", async () => {
  const ctrl = loadController({ rules: [RULES] });
  const token = await currentToken(ctrl);
  const res = await call(ctrl.submitRegistration, { params: { token }, body: { ...registration(), ...SIGNED, rulesVersion: "1" } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "RULES_CHANGED");
  assert.equal(ctrl.models.students.snapshot().length, 0);
});

test("a signed request stores who signed which version, at the server's time", async () => {
  const ctrl = loadController({ rules: [RULES] });
  const token = await currentToken(ctrl);
  const res = await call(ctrl.submitRegistration, { params: { token }, body: { ...registration(), ...SIGNED, signedAt: "2000-01-01" } });
  assert.equal(res.statusCode, 200);
  const [consent] = ctrl.models.consents.snapshot();
  const [student] = ctrl.models.students.snapshot();
  assert.equal(consent.studentId, String(student._id));
  assert.equal(consent.rulesVersion, 2);
  assert.equal(consent.signerName, "Parent");
  assert.notEqual(new Date(consent.signedAt).getFullYear(), 2000);
  assert.equal(student.signature, undefined, "the signature is not on the student");
  const read = await call(ctrl.getConsent, { params: { studentId: String(student._id) } });
  assert.equal(read.body.consent.rulesText, "the rules");
});

test("a known ID answers the same and its signature is not stored or overwritten", async () => {
  const ctrl = loadController({ rules: [RULES], students: [{ tz: registration().tz, status: "عادي" }] });
  const token = await currentToken(ctrl);
  const res = await call(ctrl.submitRegistration, { params: { token }, body: { ...registration(), ...SIGNED } });
  assert.equal(res.statusCode, 200);
  assert.equal(ctrl.models.consents.snapshot().length, 0);
});

test("a signature whose student is gone is not shown", async () => {
  const ctrl = loadController({ rules: [RULES] });
  const token = await currentToken(ctrl);
  await call(ctrl.submitRegistration, { params: { token }, body: { ...registration(), ...SIGNED } });
  const [consent] = ctrl.models.consents.snapshot();
  const read = await call(ctrl.getConsent, { params: { studentId: "gone" } });
  assert.equal(read.body.consent, null);
  assert.ok(consent);
});

test("two publishes at once: the second is told, not lost", async () => {
  const ctrl = loadController({ rules: [RULES] });
  ctrl.models.rules.create = async () => { throw Object.assign(new Error("E11000"), { code: 11000 }); };
  const res = await call(ctrl.publishRules, { body: { text: "x" } });
  assert.equal(res.statusCode, 409);
});

test("publishing makes a new version and keeps the old one", async () => {
  const ctrl = loadController({ rules: [RULES] });
  const res = await call(ctrl.publishRules, { body: { text: " new text " }, actor: { firstname: "A", lastname: "B" } });
  assert.equal(res.body.rules.version, 3);
  assert.equal(res.body.rules.text, "new text");
  assert.equal(ctrl.models.rules.snapshot().length, 2);
  assert.equal((await call(ctrl.getRules)).body.rules.version, 3);
});

test("a parent's request is saved with health سليم when blank and a class only from the list", async () => {
  const ctrl = loadController();
  const token = await currentToken(ctrl);
  await call(ctrl.submitRegistration, { params: { token }, body: { ...registration(), health_status: "", layer: "الصف الثالث" } });
  const [student] = ctrl.models.students.snapshot();
  assert.equal(student.health_status, "سليم");
  assert.equal(student.layer, "ثالث");
});

test("the built-in rules are public version zero, stay readable after publication, and match the editor default", async () => {
  const { DEFAULT_RULES } = require("../Entities/InviteToken/defaultRules");
  const clientText = fs.readFileSync(path.join(__dirname, "../../apps/system/src/Components/Student/defaultRules.js"), "utf8").match(/String.raw`([\s\S]*?)`;/)[1].replace(/\r\n/g, "\n");
  assert.equal(clientText, DEFAULT_RULES.replace(/\r\n/g, "\n"));
  const ctrl = loadController({ rules: [] });
  const token = await currentToken(ctrl);
  const opened = (await call(ctrl.validateToken, { params: { token } })).body;
  assert.equal(opened.open, true);
  assert.equal(opened.rules.version, 0);
  assert.equal(opened.rules.text, DEFAULT_RULES);
  assert.equal(ctrl.models.rules.snapshot().length, 0, "read does not seed or migrate data");
  const sent = await call(ctrl.submitRegistration, { params: { token }, body: registration({ rulesVersion: "0" }) });
  assert.equal(sent.statusCode, 200);
  const published = await call(ctrl.publishRules, { body: { text: "Edited" }, actor: { name: "Staff Name" } });
  assert.equal(published.body.rules.version, 1);
  assert.equal(ctrl.models.rules.snapshot()[0].createdByName, "Staff Name");
  const read = await call(ctrl.getConsent, { params: { studentId: ctrl.models.students.snapshot()[0]._id } });
  assert.equal(read.body.consent.rulesText, DEFAULT_RULES);
});

test("agreement without a stamp sends a request but stays unsigned until later completion", async () => {
  const ctrl = loadController();
  const token = await currentToken(ctrl);
  const sent = await call(ctrl.submitRegistration, { params: { token }, body: registration({ signature: "" }) });
  assert.equal(sent.statusCode, 200);
  const [student] = ctrl.models.students.snapshot();
  const params = { studentId: student._id };
  assert.equal(student.consentAt, null);
  let read = (await call(ctrl.getConsent, { params })).body.consent;
  assert.ok(read.acceptedAt);
  assert.equal(read.signedAt, null);
  assert.equal(read.signature, null);
  assert.equal(read.signaturePending, true);
  assert.equal((await call(ctrl.signConsent, { params, body: registration({ signature: "" }) })).statusCode, 400);
  assert.equal((await call(ctrl.signConsent, { params, body: registration(), actor: { name: "Recorder" } })).statusCode, 200);
  assert.equal(ctrl.models.consents.snapshot().length, 1);
  read = (await call(ctrl.getConsent, { params })).body.consent;
  assert.equal(read.signaturePending, false);
  assert.ok(read.signedAt);
  assert.ok(ctrl.models.students.snapshot()[0].consentAt);
  assert.equal(ctrl.models.consents.snapshot()[0].recordedBy, "Recorder");
});

test("declining agreement cannot create a student even with a valid stamp", async () => {
  const ctrl = loadController();
  const token = await currentToken(ctrl);
  const sent = await call(ctrl.submitRegistration, { params: { token }, body: registration({ rulesAccepted: "false" }) });
  assert.equal(sent.statusCode, 400);
  assert.equal(ctrl.models.students.snapshot().length, 0);
  assert.equal(ctrl.models.consents.snapshot().length, 0);
});

test("a partial later save can repair the student marker without replacing the signature evidence", async () => {
  const ctrl = loadController({ students: [{ tz: "1" }] });
  const params = { studentId: ctrl.models.students.snapshot()[0]._id };
  const update = ctrl.models.students.updateExisting;
  ctrl.models.students.updateExisting = async () => { throw new Error("simulated interrupted marker write"); };
  assert.equal((await call(ctrl.signConsent, { params, body: registration() })).statusCode, 500);
  const original = plain(ctrl.models.consents.snapshot()[0]);
  ctrl.models.students.updateExisting = update;
  assert.equal((await call(ctrl.signConsent, { params, body: registration({ signerName: "Replacement" }) })).statusCode, 200);
  assert.deepEqual(plain(ctrl.models.consents.snapshot()[0]), original);
  assert.equal(ctrl.models.students.snapshot()[0].consentAt.toISOString(), new Date(original.signedAt).toISOString());
});

test("a racing pending completion cannot overwrite already stored evidence", async () => {
  const ctrl = loadController();
  const token = await currentToken(ctrl);
  await call(ctrl.submitRegistration, { params: { token }, body: registration({ signature: "" }) });
  const params = { studentId: ctrl.models.students.snapshot()[0]._id };
  ctrl.models.consents.updateExisting = async () => ({ success: true, result: null });
  const res = await call(ctrl.signConsent, { params, body: registration() });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "CONSENT_CHANGED");
  assert.equal(ctrl.models.students.snapshot()[0].consentAt, null);
});
