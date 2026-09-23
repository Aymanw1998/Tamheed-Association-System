# Parent Registration Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One fixed, admin-rotatable link that lets parents add a child (with photo) to the students waiting list, safely.

**Architecture:** The disabled per-invite flow in `server/Entities/InviteToken` is replaced by a single secret token stored in the `InviteToken` collection. Public endpoints (`validate`, `submit`) enforce all intake rules on the server. The parents' page reuses `EditStudent` in `parent` mode. Admins see the link, weekly usage, and refused requests in a shared `ParentLinkPanel` on the dashboard and in a dialog on the students page.

**Tech Stack:** Express + Mongoose generic CRUD (`server/Entities/api.js`), multer, the in-house `rateLimit` and `authMiddleware`, `node:test` with `vm`-loaded handlers, React 18 (CRA), axios.

**Spec:** `docs/superpowers/specs/2026-09-23-parent-registration-link-design.md`

## Global Constraints

- Weekly limit: 30 parent requests (`source: "اهل"`) created in the last 7 days (rolling).
- Per-device limit: 3 submissions per hour per client address (`rateLimit`, scope `registration-submit`). Validate: 60 per 15 minutes.
- Token: `crypto.randomBytes(18).toString("base64url")`, stored as `{ key: "parent-registration", token }` in `InviteToken`; compared with `crypto.timingSafeEqual`.
- Only `ادارة` can read or rotate the link (`requireAuth` + `requireRole('ادارة')`).
- Accepted and known-ID replies are byte-identical: `{ ok: true, message: "تم استلام الطلب، سنتواصل معكم قريبًا" }`. The photo is uploaded after replying and never mentioned in the reply. A known ID never uploads its photo.
- Parents cannot set `status`, `source`, `main_teacher`, or `photo`; the server forces `status: "ينتظر"`, `source: "اهل"`, `main_teacher: null`, `photo: ""`.
- Photo: one file, `image/jpeg`, `image/png`, or `image/webp`, at most 5 MB. Otherwise `400` with code `BAD_PHOTO` and message `الصورة يجب أن تكون JPG أو PNG أو WEBP وحتى 5MB`.
- Refused attempts: collection `RegistrationAttempts`, newest 100 kept, admins shown the last 30 days, newest first.
- Owner preference: never run `git commit`; each task ends by proposing a commit message instead. No Claude co-author trailer.
- Tests: `npm test --prefix server` (node:test), `npm run verify` at the end.

---

### Task 1: Server-side Israeli ID check

**Files:**
- Create: `server/utils/israeliId.js`
- Test: `server/test/israeli-id.test.js`

**Interfaces:**
- Produces: `isValidIsraeliId(value: unknown): boolean`. It takes 5 to 9 digits, left-pads them to 9, and applies the check digit, the same way as `EditStudent.jsx`'s `isValidIsraeliId`.

- [ ] **Step 1: Write the failing test**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { isValidIsraeliId } = require("../utils/israeliId");

// Check digits worked by hand: weights 1,2,1,2,... and digit sums of products.
// 123456782 -> 1+4+3+8+5+3+7+7+2 = 40; 000000018 -> 2+8 = 10.
test("Israeli ID numbers are accepted only with a correct check digit", () => {
  const cases = [
    ["123456782", true],
    ["000000018", true],
    [" 123456782 ", true],
    ["123456789", false],
    ["12345678a", false],
    ["1234", false],
    ["1234567820", false],
    ["", false],
    [undefined, false],
  ];
  for (const [value, want] of cases) {
    assert.equal(isValidIsraeliId(value), want, String(value));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/israeli-id.test.js`
Expected: FAIL with `Cannot find module '../utils/israeliId'`

- [ ] **Step 3: Write minimal implementation**

```js
// Mirrors the client check in EditStudent.jsx: 5-9 digits, left-padded to 9,
// then the Israeli ID check digit.
function isValidIsraeliId(value) {
  const id = String(value ?? "").trim();
  if (!/^\d{5,9}$/.test(id)) return false;
  const padded = id.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * (i % 2 === 0 ? 1 : 2);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

module.exports = { isValidIsraeliId };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/israeli-id.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Propose commit** (do not run): `Add a server-side Israeli ID check`

---

### Task 2: The registration link (admin read/rotate, public validate)

**Files:**
- Create: `server/Entities/InviteToken/RegistrationAttempt.model.js`
- Replace: `server/Entities/InviteToken/InviteToken.controller.js` (whole file)
- Test: `server/test/parent-registration.test.js`

**Interfaces:**
- Consumes: `InviteTokenModelDef.get(filter)` and `.update(filter, data)` (upserts, see `server/Entities/api.js`), `StudentModelDef.get(filter)`.
- Produces: `RegistrationAttemptModelDef.{get(filter), create(data), delete(filter)}`; controller handlers `getLink(req,res)` → `200 { ok, token, usedThisWeek, weeklyLimit, attempts[] }`, `rotateLink(req,res)` → `200 { ok, token }`, `validateToken(req,res)` → `200 { valid: true, open }` or `404 { valid: false }`.

- [ ] **Step 1: Write the failing tests** (new file `server/test/parent-registration.test.js`)

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && node --test test/parent-registration.test.js`
Expected: FAIL. The old controller has no `getLink` or `rotateLink` export (`TypeError: handler is not a function`), and `Unexpected dependency` for the new model.

- [ ] **Step 3: Create `server/Entities/InviteToken/RegistrationAttempt.model.js`**

```js
const api = require("../api");

// Parent-link requests refused because the ID number was already known.
// Staff review them next to the registration link (the app has no
// notifications module), so only recent ones are kept.
const RegistrationAttemptModelDef = {
    dbName: "tamheed_db",

    collections: {
        active: "RegistrationAttempts",
    },
};

// GET
RegistrationAttemptModelDef.get = async function (filter = {}) {
    return await api.read({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
    });
};

// CREATE
RegistrationAttemptModelDef.create = async function (data) {
    return await api.create({
        dbName: this.dbName,
        collection: this.collections.active,
        data,
    });
};

// DELETE
RegistrationAttemptModelDef.delete = async function (filter) {
    return await api.delete({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
    });
};

module.exports = { RegistrationAttemptModelDef };
```

- [ ] **Step 4: Replace `server/Entities/InviteToken/InviteToken.controller.js`**

```js
const crypto = require("crypto");
const { InviteTokenModelDef } = require("./InviteToken.model");
const { RegistrationAttemptModelDef } = require("./RegistrationAttempt.model");
const { StudentModelDef } = require("../Student/Student.model");
const { handleUpload } = require("../UploadFile/file");
const { logWithSource } = require("../../middleware/logger");
const { isValidIsraeliId } = require("../../utils/israeliId");

// One fixed parent-registration link. Its secret changes only when an admin
// rotates it. Parents' requests join the waiting list (status "ينتظر") and
// never become students without staff approval.
const LINK_KEY = "parent-registration";
const WEEKLY_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ATTEMPTS_KEPT = 100;
const PARENT_SOURCE = "اهل";
const PENDING_STATUS = "ينتظر";
const RECEIVED_MESSAGE = "تم استلام الطلب، سنتواصل معكم قريبًا";

/* ================= helpers ================= */

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);

  if (typeof value === "string") {
    const s = value.trim();

    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    const ts = Date.parse(s);
    if (!Number.isNaN(ts)) return new Date(ts);
  }

  return null;
}

const resultsOf = (res) => (res?.success && Array.isArray(res.result) ? res.result : []);
const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

async function getLinkToken() {
  const [link] = resultsOf(await InviteTokenModelDef.get({ key: LINK_KEY }));
  return link?.token || null;
}

async function saveNewToken() {
  const token = crypto.randomBytes(18).toString("base64url");
  await InviteTokenModelDef.update({ key: LINK_KEY }, { key: LINK_KEY, token });
  return token;
}

async function isCurrentToken(candidate) {
  const expected = await getLinkToken();
  if (!candidate || !expected) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Parent requests created in the last 7 days, whatever their status now.
// Rejected (deleted) requests no longer count, so removing spam frees room.
async function countRecentParentRequests() {
  const since = Date.now() - 7 * DAY_MS;
  return resultsOf(await StudentModelDef.get({ source: PARENT_SOURCE }))
    .filter((student) => new Date(student.createdAt).getTime() >= since).length;
}

async function listAttempts() {
  return resultsOf(await RegistrationAttemptModelDef.get({})).sort(newestFirst);
}

const toPublicAttempt = (attempt) => ({
  tz: attempt.tz,
  firstname: attempt.firstname,
  lastname: attempt.lastname,
  phone: attempt.phone,
  father_phone: attempt.father_phone,
  mother_phone: attempt.mother_phone,
  reason: attempt.reason,
  createdAt: attempt.createdAt,
});

/* ================= admin: the link ================= */

const getLink = async (req, res) => {
  try {
    const token = (await getLinkToken()) || (await saveNewToken());
    const since = Date.now() - 30 * DAY_MS;
    const attempts = (await listAttempts())
      .filter((attempt) => new Date(attempt.createdAt).getTime() >= since)
      .map(toPublicAttempt);

    return res.status(200).json({
      ok: true,
      token,
      usedThisWeek: await countRecentParentRequests(),
      weeklyLimit: WEEKLY_LIMIT,
      attempts,
    });
  } catch (err) {
    logWithSource("InviteToken.getLink", err);
    return res.status(500).json({ ok: false, message: "تعذّر تحميل رابط التسجيل" });
  }
};

const rotateLink = async (req, res) => {
  try {
    return res.status(200).json({ ok: true, token: await saveNewToken() });
  } catch (err) {
    logWithSource("InviteToken.rotateLink", err);
    return res.status(500).json({ ok: false, message: "تعذّر تغيير الرابط" });
  }
};

/* ================= public: the parents' form ================= */

const validateToken = async (req, res) => {
  try {
    if (!(await isCurrentToken(req.params.token))) {
      return res.status(404).json({ valid: false });
    }
    return res.status(200).json({
      valid: true,
      open: (await countRecentParentRequests()) < WEEKLY_LIMIT,
    });
  } catch (err) {
    logWithSource("InviteToken.validateToken", err);
    return res.status(500).json({ valid: false, message: "خطأ في فحص الرابط" });
  }
};

module.exports = {
  getLink,
  rotateLink,
  validateToken,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && node --test test/parent-registration.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Propose commit** (do not run): `Store one rotatable parent registration link`

---

### Task 3: Parent submissions (`submitRegistration`)

**Files:**
- Modify: `server/Entities/InviteToken/InviteToken.controller.js` (add before `module.exports`, extend exports)
- Test: `server/test/parent-registration.test.js` (append)

**Interfaces:**
- Consumes: Task 2 helpers `resultsOf`, `isCurrentToken`, `countRecentParentRequests`, `listAttempts`, `toDate`; `handleUpload(file, dbName, collection, tz)` → `{ secure_url } | null`.
- Produces: `submitRegistration(req, res)`. `req.params.token`, `req.body` (form fields), and `req.file` (optional multer file). Returns `200 { ok: true, message }`, `400 { ok: false, message }`, `404 { ok: false, valid: false, message }`, or `429 { ok: false, code: "INTAKE_CLOSED", message }`.

- [ ] **Step 1: Append the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && node --test test/parent-registration.test.js`
Expected: the 9 new tests FAIL with `TypeError: handler is not a function` (`submitRegistration` is not exported yet). The 3 Task 2 tests still PASS.

- [ ] **Step 3: Add to the controller** (insert above `module.exports`, after `validateToken`)

```js
const SHORT_FIELDS = [
  "firstname", "lastname", "gender", "phone", "email", "city", "street",
  "father_name", "mother_name", "father_phone", "mother_phone",
  "father_work", "mother_work", "school", "layer",
];
const LONG_FIELDS = ["health_status", "notes"];

const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);

// Only these fields are read from the public form; status, source,
// main_teacher and photo are always set by the server.
function readRegistration(body = {}) {
  const fields = { tz: String(body.tz ?? "").trim() };
  for (const name of SHORT_FIELDS) fields[name] = cleanText(body[name], 100);
  for (const name of LONG_FIELDS) fields[name] = cleanText(body[name], 1000);
  fields.birth_date = toDate(cleanText(body.birth_date, 40));
  return fields;
}

function registrationError(fields) {
  if (!isValidIsraeliId(fields.tz)) return "رقم الهوية غير صحيح";
  if (!fields.firstname || !fields.lastname) return "اسم الطالب واسم العائلة مطلوبان";
  return "";
}

async function recordAttempt(fields, reason) {
  await RegistrationAttemptModelDef.create({
    tz: fields.tz,
    firstname: fields.firstname,
    lastname: fields.lastname,
    phone: fields.phone,
    father_phone: fields.father_phone,
    mother_phone: fields.mother_phone,
    reason,
    createdAt: new Date(),
  });
  // Keep only the newest attempts so a flood cannot grow the collection.
  for (const old of (await listAttempts()).slice(ATTEMPTS_KEPT)) {
    await RegistrationAttemptModelDef.delete({ _id: old._id });
  }
}

async function savePhoto(tz, file) {
  try {
    const uploaded = await handleUpload(
      file,
      StudentModelDef.dbName,
      StudentModelDef.collections.active,
      tz
    );
    if (uploaded?.secure_url) {
      await StudentModelDef.update({ tz }, { photo: uploaded.secure_url });
    }
  } catch (err) {
    logWithSource("InviteToken.savePhoto", err);
  }
}

const submitRegistration = async (req, res) => {
  try {
    if (!(await isCurrentToken(req.params.token))) {
      return res.status(404).json({
        ok: false,
        valid: false,
        message: "الرابط غير صالح، اطلبوا الرابط من الجمعية",
      });
    }

    if ((await countRecentParentRequests()) >= WEEKLY_LIMIT) {
      return res.status(429).json({
        ok: false,
        code: "INTAKE_CLOSED",
        message: "استقبال الطلبات متوقف مؤقتًا، حاولوا بعد أيام",
      });
    }

    const fields = readRegistration(req.body);
    const error = registrationError(fields);
    if (error) {
      return res.status(400).json({ ok: false, message: error });
    }

    // A known ID gets exactly the same reply as a new one, so the public form
    // cannot reveal who is registered; staff see the refusal next to the link.
    const [existing] = resultsOf(await StudentModelDef.get({ tz: fields.tz }));
    if (existing) {
      await recordAttempt(fields, existing.status === PENDING_STATUS ? "pending" : "exists");
      return res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });
    }

    const now = new Date();
    await StudentModelDef.create({
      ...fields,
      photo: "",
      main_teacher: null,
      source: PARENT_SOURCE,
      status: PENDING_STATUS,
      createdAt: now,
      updatedAt: now,
    });
    res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });

    // Uploaded after replying: the reply must not wait on (or mention) Drive,
    // or its timing would tell a new ID from a known one.
    if (req.file) {
      await savePhoto(fields.tz, req.file);
    }
  } catch (err) {
    logWithSource("InviteToken.submitRegistration", err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "تعذّر إرسال الطلب، حاولوا لاحقًا" });
    }
  }
};
```

and extend the exports:

```js
module.exports = {
  getLink,
  rotateLink,
  validateToken,
  submitRegistration,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && node --test test/parent-registration.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Propose commit** (do not run): `Accept parent registrations into the waiting list`

---

### Task 4: Routes, limits, and mounting

**Files:**
- Modify: `server/Entities/InviteToken/InviteToken.route.js` (replace the active code above the `// OLD CODE` block)
- Modify: `server/server.js:76-92` (remove `PARENT_INVITE_ENABLED`, mount always)
- Test: `server/test/parent-registration.test.js` (append)

**Interfaces:**
- Consumes: `getLink`, `rotateLink`, `validateToken`, `submitRegistration` (Tasks 2 and 3); `requireAuth`, `requireRole` from `server/middleware/authMiddleware.js`; `rateLimit({ windowMs, max, scope })` from `server/middleware/rateLimit.js`.
- Produces: `GET /api/inviteToken/link`, `POST /api/inviteToken/link/rotate` (admin); `GET /api/inviteToken/validate/:token`, `POST /api/inviteToken/submit/:token` (public, multipart field `photo`).

- [ ] **Step 1: Append the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && node --test test/parent-registration.test.js`
Expected: the 4 route tests FAIL. The old router registers `/create-link` and has no `/link`, so `find(...)` is `undefined` (`TypeError: Cannot read properties of undefined (reading 'handlers')`).

- [ ] **Step 3: Replace the active code of `InviteToken.route.js`** (keep the `// OLD CODE - DO NOT SUGGEST` block below it unchanged)

```js
const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  getLink,
  rotateLink,
  validateToken,
  submitRegistration,
} = require("./InviteToken.controller");
const { requireAuth: protect, requireRole: protectRole } = require("../../middleware/authMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const allowed = PHOTO_TYPES.has(file.mimetype);
    cb(allowed ? null : new Error("Unsupported photo type"), allowed);
  },
});

// Multer errors (size, type, extra files) become one Arabic 400 instead of
// the generic error handler's 500.
const acceptPhoto = (req, res, next) => {
  photoUpload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        ok: false,
        code: "BAD_PHOTO",
        message: "الصورة يجب أن تكون JPG أو PNG أو WEBP وحتى 5MB",
      });
    }
    next();
  });
};

router.get("/link", protect, protectRole("ادارة"), getLink);
router.post("/link/rotate", protect, protectRole("ادارة"), rotateLink);

// Public: parents open these from the shared link without logging in.
router.get(
  "/validate/:token",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 60, scope: "registration-validate" }),
  validateToken
);
router.post(
  "/submit/:token",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 3, scope: "registration-submit" }),
  acceptPhoto,
  submitRegistration
);

module.exports = router;
```

- [ ] **Step 4: Mount the router in `server/server.js`**

Replace:

```js
// Both endpoints below are reachable without authentication, so they stay
// unmounted until that's fixed: /api/ai/chat bills a real Anthropic call per
// request, and /api/inviteToken/create-link mints student-registration links.
// Flipping a flag back on must be paired with adding auth to its routes, and
// with the matching client-side flag.
const AI_ENABLED = false;
const PARENT_INVITE_ENABLED = false;
```

with:

```js
// /api/ai/chat is reachable without authentication and bills a real Anthropic
// call per request, so it stays unmounted until its routes require auth.
const AI_ENABLED = false;
```

and replace:

```js
if (PARENT_INVITE_ENABLED) {
  app.use('/api/inviteToken', require('./Entities/InviteToken/InviteToken.route'))
}
```

with:

```js
app.use('/api/inviteToken', require('./Entities/InviteToken/InviteToken.route'))
```

- [ ] **Step 5: Run the server suite**

Run: `cd server && npm test`
Expected: PASS (all files; `parent-registration.test.js` 16 tests)

Run: `cd server && node --check server.js`
Expected: no output

- [ ] **Step 6: Propose commit** (do not run): `Expose the parent registration link with admin-only management and intake limits`

---

### Task 5: Deleting a student removes the Drive photo

**Files:**
- Modify: `server/Entities/Student/Student.controller.js` (`deleteS`, after `StudentModelDef.delete`)
- Test: `server/test/photo-storage.test.js` (extend `createModel`, append a test)

**Interfaces:**
- Consumes: `handleDeleteByUrl(url)` (already imported in the controller).
- Produces: `DELETE /api/student/:tz` also deletes `student.photo` from Drive.

- [ ] **Step 1: Add `delete` to `createModel` in `photo-storage.test.js`** (inside the returned object, after `update`)

```js
    async delete(filter) {
      events.push(["db-delete", filter]);
      docs = docs.filter((doc) => !matches(doc, filter));
      return { success: true };
    },
```

and append the failing test:

```js
test("deleting a student also deletes their photo from Drive", async () => {
  const events = [];
  const model = createModel(
    [{ tz: "123456782", firstname: "Example", photo: OLD_PHOTO }],
    events,
    { dbName: "tamheed_db", collections: { active: "Students" } }
  );
  const { deleteS } = loadStudentController(model, createDriveStorage(events, null));
  const res = createRes();

  await deleteS({ params: { tz: "123456782" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    ["db-delete", { tz: "123456782" }],
    ["drive-delete", OLD_PHOTO],
  ]);
  assert.equal(model.snapshot().length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && node --test test/photo-storage.test.js`
Expected: the new test FAILS. `events` has only `["db-delete", …]`, with no `drive-delete`.

- [ ] **Step 3: Implement in `deleteS`**

After `const deleted = await StudentModelDef.delete({ tz });` insert:

```js
    // Rejecting a waiting-list request or deleting a student also removes the
    // photo from Drive, so no orphaned files stay behind.
    const photo = existing.result[0]?.photo;
    if (photo) {
      await handleDeleteByUrl(photo);
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && node --test test/photo-storage.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Propose commit** (do not run): `Delete a student's Drive photo along with the student`

---

### Task 6: Client service and the parents' page

**Files:**
- Replace: `client/src/WebServer/services/inviteToken/functionInviteToken.jsx`
- Modify: `client/src/Components/Student/EditStudent.jsx` (parent mode: state, validate effect, submit branch, render guards, title)
- Modify: `client/src/Components/Routes/Routes.jsx` (public route)

**Interfaces:**
- Consumes: Task 4 endpoints; `api` (authenticated) and `publicApi` (no auth interceptors) from `client/src/WebServer/services/api.jsx`.
- Produces: `getLink()` → `{ ok, token, usedThisWeek, weeklyLimit, attempts } | { ok: false, message }`; `rotateLink()` → `{ ok, token } | { ok: false, message }`; `validate(token)` → `{ valid, open }`; `submit(token, fields, photo)` → `{ ok: true, message } | { ok: false, code, message }`.

The client has no component-test harness (only `api.test.js`), so Task 6 and Task 7 are verified by the production build and by one manual check by the owner. All rules are enforced and tested on the server.

- [ ] **Step 1: Replace `functionInviteToken.jsx`**

```js
import api, { publicApi } from "../api";

const errorMessage = (err, fallback) => err?.response?.data?.message || fallback;

// Admin only: the fixed parent-registration link and its intake stats.
export const getLink = async () => {
    try {
        const { data } = await api.get("/inviteToken/link");
        return {
            ok: true,
            token: data.token,
            usedThisWeek: data.usedThisWeek,
            weeklyLimit: data.weeklyLimit,
            attempts: data.attempts || [],
        };
    } catch (err) {
        return { ok: false, message: errorMessage(err, "تعذّر تحميل رابط التسجيل") };
    }
};

export const rotateLink = async () => {
    try {
        const { data } = await api.post("/inviteToken/link/rotate");
        return { ok: true, token: data.token };
    } catch (err) {
        return { ok: false, message: errorMessage(err, "تعذّر تغيير الرابط") };
    }
};

// Public: the parents' page must never send or refresh a login, so these use
// publicApi instead of api.
export const validate = async (token) => {
    try {
        const { data } = await publicApi.get(`/inviteToken/validate/${encodeURIComponent(token)}`);
        return { valid: Boolean(data?.valid), open: Boolean(data?.open) };
    } catch (err) {
        return { valid: false, open: false };
    }
};

export const submit = async (token, fields, photo) => {
    try {
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => {
            if (value !== null && value !== undefined) formData.append(key, value);
        });
        if (photo instanceof File) formData.append("photo", photo);

        const { data } = await publicApi.post(`/inviteToken/submit/${encodeURIComponent(token)}`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 120000, // a 5MB photo on a slow phone connection
        });
        return { ok: true, message: data?.message };
    } catch (err) {
        return {
            ok: false,
            code: err?.response?.data?.code || "",
            message: errorMessage(err, "تعذّر إرسال الطلب، حاولوا لاحقًا"),
        };
    }
};
```

- [ ] **Step 2: `EditStudent.jsx`, parent state.** Replace the `inviteToken` and `inviteStatus` state block:

```js
  // ملاحظة عربية
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteStatus, setInviteStatus] = useState({
    checking: parent,   // ملاحظة عربية
    valid: !parent,     // ملاحظة عربية
    message: "",
  });
```

with:

```js
  // Parents arrive through the fixed registration link /register-student/:token.
  const registrationToken = parent ? params.token : null;
  const [inviteStatus, setInviteStatus] = useState({
    checking: parent,
    valid: !parent,
    open: true,
  });
  const [submitted, setSubmitted] = useState(false);
```

- [ ] **Step 3: `EditStudent.jsx`, validate effect.** Replace the whole `useEffect` that reads `params.get("invite")` (from `if (!parent) return;` through `}, [parent]);`) with:

```js
  useEffect(() => {
    if (!parent) return;
    if (!registrationToken) {
      setInviteStatus({ checking: false, valid: false, open: false });
      return;
    }
    (async () => {
      const res = await validateINV(registrationToken);
      setInviteStatus({ checking: false, valid: res.valid, open: res.open });
    })();
  }, [parent, registrationToken]);
```

- [ ] **Step 4: `EditStudent.jsx`, submit branch.** Replace:

```js
      if(parent && !inviteToken){
          toast.error("رابط التسجيل غير صالح");
          return;
      }
      else if(parent) {
        const res = await submitFromParent(inviteToken, payload);
        if (!res || !res.ok) {
          throw new Error(res?.message || "فشل ارسال النموذج");
        }

        toast.success("✅ تم ارسال تفاصيل الطالب بنجاح");
        if(!photo) return;
        const res2 = await uploadPhoto(form.tz, photo);
        if(!res2) return;
        if(!res2.ok) {
          toast.warn("لم يتم تحميل صورة الطالب: " + res2.message);
        }
        else{
          toast.success("✅ تم تحميل صورة الطالب بنجاح");
        }
        // ملاحظة عربية
        return;
      }
```

with:

```js
      if (parent) {
        const res = await submitFromParent(registrationToken, payload, photo);
        if (!res.ok) {
          if (res.code === "INTAKE_CLOSED") {
            setInviteStatus({ checking: false, valid: true, open: false });
            return;
          }
          throw new Error(res.code === "RATE_LIMITED" ? "حاولوا بعد ساعة" : res.message);
        }
        setSubmitted(true);
        return;
      }
```

- [ ] **Step 5: `EditStudent.jsx`, parent render guards and title.** Replace the `if (parent) { … }` render block (checking / invalid) with:

```js
  if (parent) {
    if (inviteStatus.checking) {
      return (
        <div className={styles.formContainer}>
          جار فحص صلاحية رابط التسجيل...
        </div>
      );
    }
    if (!inviteStatus.valid) {
      return (
        <div className={styles.formContainer} style={{ color: "#b91c1c", textAlign: "center" }}>
          <h2>الرابط غير صالح</h2>
          <p>اطلبوا الرابط من الجمعية.</p>
        </div>
      );
    }
    if (!inviteStatus.open) {
      return (
        <div className={styles.formContainer} style={{ textAlign: "center" }}>
          <h2>استقبال الطلبات متوقف مؤقتًا</h2>
          <p>حاولوا بعد أيام.</p>
        </div>
      );
    }
    if (submitted) {
      return (
        <div className={styles.formContainer} style={{ textAlign: "center" }}>
          <h2>تم استلام الطلب</h2>
          <p>سنتواصل معكم قريبًا.</p>
        </div>
      );
    }
  }
```

and change the form title to:

```js
      <h2 style={{textAlign: "center"}}>{parent ? "طلب تسجيل طالب" : isEdit ? "تحديث بيانات الطالب" : "اضافة طالب جديد"}</h2>
```

- [ ] **Step 6: `Routes.jsx`.** Replace:

```js
      <Route path="/parent-register" element={<EditStudent parent={true} />} />
```

with:

```js
      <Route path="/register-student/:token" element={<EditStudent parent={true} />} />
```

- [ ] **Step 7: Build**

Run: `npm run build --prefix client`
Expected: `Compiled successfully.` (no `no-unused-vars` for `inviteToken` or `setInviteToken`)

- [ ] **Step 8: Propose commit** (do not run): `Open the student form to parents through the fixed registration link`

---

### Task 7: Admin panel on the dashboard and the students page

**Files:**
- Create: `client/src/Components/Student/ParentLinkPanel.jsx`
- Create: `client/src/Components/Student/ParentLinkPanel.module.css`
- Modify: `client/src/Components/Dashboard/Dashboard.jsx` (import, admin panel after "طلاب بانتظار الموافقة")
- Modify: `client/src/Components/Student/ViewAllStudent.jsx` (remove `PARENT_INVITE_ENABLED`, `createLink`, `ask`; add button and dialog)

**Interfaces:**
- Consumes: `getLink`, `rotateLink` (Task 6); `ask(kind, overrides)` from `Components/Provides/confirmBus.js`; `Button`; `toast`.
- Produces: default `ParentLinkPanel` (no props) and named `ParentLinkDialog({ onClose })`.

- [ ] **Step 1: Create `ParentLinkPanel.jsx`**

```jsx
import React, { useCallback, useEffect, useState } from "react";
import Button from "../UI/Button.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus.js";
import { getLink, rotateLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import styles from "./ParentLinkPanel.module.css";

const REASON_LABEL = { exists: "موجود في النظام", pending: "طلب سابق ينتظر" };

const registrationUrl = (token) => `${window.location.origin}/register-student/${token}`;

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-GB");
};

// Admin-only view of the fixed parent-registration link: copy, rotate, this
// week's intake, and the requests refused because the ID was already known.
export default function ParentLinkPanel() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    const res = await getLink();
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError("");
    setInfo(res);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl(info.token));
      toast.success("تم نسخ الرابط");
    } catch {
      toast.warn("لم يتم النسخ، انسخ الرابط يدويًا");
    }
  };

  const rotate = async () => {
    let confirmed = false;
    try {
      confirmed = await ask("", {
        title: "تغيير الرابط",
        message: "الرابط الحالي سيتوقف فورًا، وستحتاج لإرسال الرابط الجديد للأهل. هل تريد المتابعة؟",
        confirmText: "تغيير",
        cancelText: "إلغاء",
        danger: true,
      });
    } catch {
      toast.error("نافذة التأكيد غير جاهزة الآن");
      return;
    }
    if (!confirmed) return;

    setRotating(true);
    const res = await rotateLink();
    setRotating(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("تم تغيير الرابط");
    load();
  };

  if (error) return <p className={styles.error}>{error}</p>;
  if (!info) return <p className={styles.muted}>جاري التحميل...</p>;

  const full = info.usedThisWeek >= info.weeklyLimit;

  return (
    <div className={styles.panel} dir="rtl">
      <div className={styles.linkRow}>
        <input
          className={styles.linkInput}
          readOnly
          dir="ltr"
          value={registrationUrl(info.token)}
          aria-label="رابط تسجيل الأهل"
          onFocus={(e) => e.target.select()}
        />
        <Button size="sm" onClick={copy}>نسخ</Button>
      </div>
      <p className={styles.muted}>أرسل هذا الرابط للأهل. غيّره فقط إذا وصل لأشخاص غرباء.</p>
      <div>
        <Button size="sm" variant="danger" loading={rotating} onClick={rotate}>تغيير الرابط</Button>
      </div>

      <div className={styles.usage}>
        <span>طلبات آخر 7 أيام</span>
        <strong className={full ? styles.full : ""}>{info.usedThisWeek} من {info.weeklyLimit}</strong>
        {full && <small>الرابط لا يستقبل طلبات جديدة حتى ينخفض العدد.</small>}
      </div>

      <h3 className={styles.subTitle}>طلبات رُفضت تلقائيًا</h3>
      {info.attempts.length ? (
        <ul className={styles.attempts}>
          {info.attempts.map((attempt, index) => (
            <li key={`${attempt.tz}-${attempt.createdAt}-${index}`}>
              <strong>{attempt.firstname} {attempt.lastname}</strong>
              <span>هوية {attempt.tz}</span>
              <span dir="ltr">{attempt.father_phone || attempt.mother_phone || attempt.phone || "-"}</span>
              <span>{REASON_LABEL[attempt.reason] || attempt.reason}</span>
              <em>{formatDate(attempt.createdAt)}</em>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>لا توجد طلبات مرفوضة.</p>
      )}
    </div>
  );
}

// The same panel in a modal, for the students page.
export function ParentLinkDialog({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="رابط تسجيل الأهل" dir="rtl">
        <div className={styles.dialogHeader}>
          <h2>رابط تسجيل الأهل</h2>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="إغلاق">✕</Button>
        </div>
        <ParentLinkPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `ParentLinkPanel.module.css`**

```css
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.linkRow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.linkInput {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-family: monospace;
  font-size: var(--fs-xs);
}

.muted {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--fs-xs);
}

.error {
  margin: 0;
  color: var(--color-danger-700);
}

.usage {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.usage span,
.usage small {
  color: var(--color-text-secondary);
  font-size: var(--fs-xs);
}

.usage strong {
  font-size: var(--fs-2xl);
  color: var(--color-primary-600);
}

.usage strong.full {
  color: var(--color-danger-700);
}

.subTitle {
  margin: 0;
  font-size: 1rem;
}

.attempts {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.attempts li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--fs-xs);
}

.attempts li:last-child {
  border-bottom: 0;
}

.attempts em {
  color: var(--color-text-secondary);
  font-style: normal;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(13, 48, 64, 0.55);
}

.dialog {
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.dialogHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.dialogHeader h2 {
  margin: 0;
  font-size: 1.1rem;
}
```

- [ ] **Step 3: `Dashboard.jsx`.** Add the import:

```js
import ParentLinkPanel from "../Student/ParentLinkPanel.jsx";
```

and, right after the `{canApproveStudents && ( … )}` "طلاب بانتظار الموافقة" section, insert:

```jsx
        {isAdmin && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>رابط تسجيل الأهل</h2>
            </div>
            <ParentLinkPanel />
          </section>
        )}
```

- [ ] **Step 4: `ViewAllStudent.jsx`.**

Remove these imports and the flag:

```js
import { createLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { ask } from "../Provides/confirmBus.js";
```

```js
// Mirrors PARENT_INVITE_ENABLED in server.js — the invite endpoints are
// unmounted there, so offering the parent-link option would just fail.
const PARENT_INVITE_ENABLED = false;
```

Add the import:

```js
import { ParentLinkDialog } from "./ParentLinkPanel.jsx";
```

Replace the whole `handleAddStudent` function with:

```js
  const handleAddStudent = () => {
    navigate("/students/new");
  };
  const closeParentLink = useCallback(() => setShowParentLink(false), []);
```

Add the state next to the other `useState` calls:

```js
  const [showParentLink, setShowParentLink] = useState(false);
```

In the toolbar, right after the admin "إضافة طالب جديد" button block, add:

```jsx
          {isAdmin && (
            <Button variant="secondary" onClick={() => setShowParentLink(true)}>
              رابط تسجيل الأهل
            </Button>
          )}
```

and render the dialog just before the closing `</div>` of the component's root:

```jsx
      {showParentLink && <ParentLinkDialog onClose={closeParentLink} />}
```

- [ ] **Step 5: Build**

Run: `npm run build --prefix client`
Expected: `Compiled successfully.`

- [ ] **Step 6: Propose commit** (do not run): `Show the parent registration link to admins on the dashboard and students page`

---

### Task 8: Full verification and review handoff

**Files:**
- Modify: `docs/AI_REVIEW_LOG.md` (append an entry)

- [ ] **Step 1: Run everything**

Run: `npm run verify`
Expected: all server tests pass (21 existing + 1 + 16 + 1 = 39), 10 client tests pass, and `Compiled successfully.`

- [ ] **Step 2: Append the review-log entry.** It covers the request, decisions, changed files, test counts, what was not verified (no browser or Drive run, since Atlas is unreachable from this machine), known limits from the spec, and "Codex review pending (no live connection)".

- [ ] **Step 3: Report to the owner in Arabic** and propose the commit message(s). Do not commit.
