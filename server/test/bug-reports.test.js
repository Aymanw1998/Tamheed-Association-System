// «الإبلاغ عن مشكلة» (owner, 2026-11-04): one press sends a fresh server error;
// otherwise a window for a fault, a suggestion or a tangible problem.
const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const http = require("node:http");

const { maskLongNumbers, cleanText, imageTypeOf } = require("../utils/reportRedact");
const { createRecentErrors, WINDOW_MS } = require("../utils/recentErrors");
const { createBugReports } = require("../Entities/BugReport/BugReport.controller");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ACTOR = { id: "u1", tz: "209138155", name: "ليلى", role: "مرشد", user: { role: "مرشد" } };

function store() {
  const rows = [];
  let next = 1;
  return {
    rows,
    async create(doc) { const row = { _id: `id${next++}`, ...doc }; rows.push(row); return { result: row }; },
    async get(filter = {}) {
      const result = rows.filter((r) => Object.entries(filter).every(([k, v]) => String(r[k]) === String(v)));
      return { result };
    },
    async remove(filter) {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (Object.entries(filter).every(([k, v]) => String(rows[i][k]) === String(v))) rows.splice(i, 1);
      }
      return before - rows.length;
    },
  };
}

function setup({ mailFails = false } = {}) {
  let clock = 1_000_000;
  const now = () => clock;
  const errors = createRecentErrors({ now });
  const reports = store();
  const images = store();
  const mails = [];
  const audits = [];
  const users = {
    async get() {
      return { result: [
        { tz: "1", isIT: true, email: "it1@example.org" },
        { tz: "2", isIT: true, email: "it2@example.org" },
        { tz: "3", isIT: true, itBlockedAt: new Date(), email: "blocked@example.org" },
        { tz: "4", isIT: true, email: "test@test.com" },
        { tz: "5", email: "guide@example.org" },
      ] };
    },
  };
  const controller = createBugReports({
    reports, images, users, errors, now,
    audit: { record: async (req, row) => audits.push(row) },
    sendMail: async (to, report) => {
      if (mailFails) throw new Error("smtp down");
      mails.push({ to, report });
    },
    systemEmail: () => "system@example.org",
  });
  return { controller, errors, reports, images, mails, audits, tick: (ms) => { clock += ms; } };
}

const res = () => {
  const out = { statusCode: 200, body: null, headers: {} };
  out.status = (code) => { out.statusCode = code; return out; };
  out.json = (body) => { out.body = body; return out; };
  out.set = (name, value) => { out.headers[name] = value; return out; };
  out.send = (body) => { out.body = body; return out; };
  return out;
};
const settled = () => new Promise((resolve) => setTimeout(resolve, 5));

// Runs a request through the capture, as the server does, so the error is real.
function failingRequest(errors, { path = "/api/student/209138155?token=abc", message = "boom for 209138155", actor = ACTOR } = {}) {
  return new Promise((resolve) => {
    const app = express();
    app.use(errors.middleware);
    app.use((req, res2) => {
      req.actor = actor;
      errors.note(new Error(message), "Student.update");
      res2.status(500).json({ ok: false, message: "حدث خطأ" });
    });
    const server = http.createServer(app).listen(0, () => {
      http.request({ port: server.address().port, path, method: "PUT" }, (response) => {
        response.resume();
        response.on("end", () => server.close(() => resolve(response.headers["x-request-id"])));
      }).end();
    });
  });
}

test("a long number keeps only its last four digits; short ones stay", () => {
  assert.equal(maskLongNumbers("student 209138155 age 13 year 2026"), "student ••••8155 age 13 year 2026");
  assert.equal(maskLongNumbers("/api/student/209138155"), "/api/student/••••8155");
  assert.equal(maskLongNumbers("12345"), "••••2345");
  assert.equal(maskLongNumbers("1234"), "1234");
});

test("text is cut, stripped of control characters, and a token never survives", () => {
  assert.equal(cleanText("a\u0000b", 10), "ab");
  assert.equal(cleanText("abcdef", 3), "abc");
  assert.equal(cleanText(null, 3), "");
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-DEF_123";
  assert.ok(!cleanText(`Bearer ${jwt} failed`, 200).includes(jwt));
});

test("only real PNG, JPEG and WebP pictures are accepted, whatever they claim", () => {
  assert.equal(imageTypeOf(PNG), "image/png");
  assert.equal(imageTypeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(imageTypeOf(Buffer.from("RIFF0000WEBPVP8 ")), "image/webp");
  assert.equal(imageTypeOf(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(imageTypeOf(Buffer.alloc(0)), null);
});

test("the capture keeps a 5xx with its exact error, without the query string or long numbers", async () => {
  const { errors } = setup();
  const id = await failingRequest(errors);
  assert.ok(id);
  const entry = errors.find(id);
  assert.equal(entry.status, 500);
  assert.equal(entry.method, "PUT");
  assert.equal(entry.path, "/api/student/••••8155");
  assert.equal(entry.message, "boom for ••••8155");
  assert.equal(entry.source, "Student.update");
});

test("the capture ignores a request that did not fail on the server", async () => {
  const errors = createRecentErrors();
  const id = await new Promise((resolve) => {
    const app = express();
    app.use(errors.middleware);
    app.use((req, res2) => res2.status(404).json({}));
    const server = http.createServer(app).listen(0, () => {
      http.request({ port: server.address().port, path: "/x" }, (response) => {
        response.resume();
        response.on("end", () => server.close(() => resolve(response.headers["x-request-id"])));
      }).end();
    });
  });
  assert.equal(errors.find(id), null);
});

test("one press: a fresh server error is stored and mailed to every IT mailbox", async () => {
  const { controller, errors, reports, mails } = setup();
  const id = await failingRequest(errors);
  const out = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", requestId: id, section: "الطلاب", page: "/students/209138155" } }, out);
  assert.equal(out.statusCode, 201);
  const row = reports.rows[0];
  assert.equal(row.type, "fault");
  assert.equal(row.source, "auto");
  assert.equal(row.reporterName, "ليلى");
  assert.equal(row.reporterRole, "مرشد");
  assert.equal(row.section, "الطلاب");
  assert.equal(row.page, "/students/••••8155");
  assert.equal(row.action, "PUT /api/student/••••8155");
  assert.equal(row.errorStatus, 500);
  assert.equal(row.errorMessage, "boom for ••••8155");
  assert.equal(row.requestId, id);
  await settled();
  assert.deepEqual(mails.map((m) => m.to).sort(), ["it1@example.org", "it2@example.org", "system@example.org"]);
});

test("one press: an error older than two minutes sends nothing and asks for the window", async () => {
  const { controller, errors, reports, mails, tick } = setup();
  const id = await failingRequest(errors);
  tick(WINDOW_MS + 1);
  const out = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", requestId: id } }, out);
  assert.equal(out.statusCode, 409);
  assert.equal(out.body.code, "NO_RECENT_ERROR");
  assert.equal(reports.rows.length, 0);
  await settled();
  assert.equal(mails.length, 0);
});

test("one press: exactly two minutes still counts", async () => {
  const { controller, errors, tick } = setup();
  const id = await failingRequest(errors);
  tick(WINDOW_MS);
  const out = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", requestId: id } }, out);
  assert.equal(out.statusCode, 201);
});

test("one press: the same error is not reported twice", async () => {
  const { controller, errors, reports } = setup();
  const id = await failingRequest(errors);
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", requestId: id } }, res());
  const out = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", requestId: id } }, out);
  assert.equal(out.statusCode, 409);
  assert.equal(reports.rows.length, 1);
});

test("one press: another user's error is not theirs to report", async () => {
  const { controller, errors, reports } = setup();
  const id = await failingRequest(errors);
  const out = res();
  await controller.create({ actor: { ...ACTOR, id: "u2" }, headers: {}, body: { mode: "auto", requestId: id } }, out);
  assert.equal(out.statusCode, 409);
  assert.equal(reports.rows.length, 0);
});

test("one press: an invented id is refused", async () => {
  const { controller, reports } = setup();
  const out = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", requestId: "nope" } }, out);
  assert.equal(out.statusCode, 409);
  assert.equal(reports.rows.length, 0);
});

test("one press: a dead server or a crashed screen needs a fresh time and is marked as such", async () => {
  const { controller, reports } = setup();
  const out = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", kind: "network", ageMs: 1000, action: "POST /api/student", message: "Network Error", section: "الطلاب" } }, out);
  assert.equal(out.statusCode, 201);
  assert.equal(reports.rows[0].errorKind, "network");
  assert.equal(reports.rows[0].action, "POST /api/student");
  const old = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", kind: "crash", ageMs: WINDOW_MS + 1, message: "x" } }, old);
  assert.equal(old.statusCode, 409);
  const bad = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "auto", kind: "other", ageMs: 1 } }, bad);
  assert.equal(bad.statusCode, 409);
});

test("the window: each kind with text and a picture; numbers in the text are masked", async () => {
  const { controller, reports, images } = setup();
  for (const type of ["fault", "suggestion", "problem"]) {
    const out = res();
    await controller.create({ actor: ACTOR, headers: {}, file: { buffer: PNG }, body: { mode: "manual", type, text: "طالب 209138155", section: "الطلاب" } }, out);
    assert.equal(out.statusCode, 201);
  }
  assert.deepEqual(reports.rows.map((r) => r.type), ["fault", "suggestion", "problem"]);
  assert.equal(reports.rows[0].text, "طالب ••••8155");
  assert.equal(reports.rows[0].source, "manual");
  assert.equal(reports.rows[0].hasImage, true);
  assert.equal(images.rows.length, 3);
  assert.equal(images.rows[0].contentType, "image/png");
  assert.equal(images.rows[0].reportId, reports.rows[0]._id);
});

test("the window refuses an empty text, an unknown kind and a file that is not a picture", async () => {
  const { controller, reports } = setup();
  const cases = [
    { body: { mode: "manual", type: "fault", text: "   " } },
    { body: { mode: "manual", type: "other", text: "x" } },
    { body: { mode: "manual", type: "fault", text: "x" }, file: { buffer: Buffer.from("<svg></svg>") } },
  ];
  for (const request of cases) {
    const out = res();
    await controller.create({ actor: ACTOR, headers: {}, ...request }, out);
    assert.equal(out.statusCode, 400);
  }
  assert.equal(reports.rows.length, 0);
});

test("a failed email never loses the report", async () => {
  const { controller, reports } = setup({ mailFails: true });
  const out = res();
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "manual", type: "suggestion", text: "فكرة" } }, out);
  assert.equal(out.statusCode, 201);
  await settled();
  assert.equal(reports.rows.length, 1);
});

test("the mail carries no picture", async () => {
  const { controller, mails } = setup();
  await controller.create({ actor: ACTOR, headers: {}, file: { buffer: PNG }, body: { mode: "manual", type: "problem", text: "x" } }, res());
  await settled();
  assert.equal(mails[0].report.hasImage, true);
  assert.equal(mails[0].report.image, undefined);
});

test("the list has no image bytes and shows the newest first", async () => {
  const { controller, tick } = setup();
  await controller.create({ actor: ACTOR, headers: {}, file: { buffer: PNG }, body: { mode: "manual", type: "fault", text: "old" } }, res());
  tick(1000);
  await controller.create({ actor: ACTOR, headers: {}, body: { mode: "manual", type: "fault", text: "new" } }, res());
  const out = res();
  await controller.list({ actor: {} }, out);
  assert.deepEqual(out.body.reports.map((r) => r.text), ["new", "old"]);
  assert.equal(JSON.stringify(out.body).includes("image\":{"), false);
});

test("the picture is served as a picture that cannot run, and only if it exists", async () => {
  const { controller, reports } = setup();
  await controller.create({ actor: ACTOR, headers: {}, file: { buffer: PNG }, body: { mode: "manual", type: "fault", text: "x" } }, res());
  const out = res();
  await controller.image({ params: { id: reports.rows[0]._id } }, out);
  assert.equal(out.headers["Content-Type"], "image/png");
  assert.equal(out.headers["X-Content-Type-Options"], "nosniff");
  assert.match(out.headers["Cache-Control"], /no-store/);
  assert.deepEqual(Buffer.from(out.body), PNG);
  const missing = res();
  await controller.image({ params: { id: "nope" } }, missing);
  assert.equal(missing.statusCode, 404);
});

test("done or deleted: the report and its picture are gone for good, with an audit row without the text", async () => {
  const { controller, reports, images, audits } = setup();
  await controller.create({ actor: ACTOR, headers: {}, file: { buffer: PNG }, body: { mode: "manual", type: "fault", text: "سر" } }, res());
  const id = reports.rows[0]._id;
  const out = res();
  await controller.remove({ actor: {}, params: { id } }, out);
  assert.equal(out.statusCode, 200);
  assert.equal(reports.rows.length, 0);
  assert.equal(images.rows.length, 0);
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits[0]).includes("سر"), false);
  const again = res();
  await controller.remove({ actor: {}, params: { id } }, again);
  assert.equal(again.statusCode, 404);
});

test("the routes need a session, and the IT routes need the IT session", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  assert.match(read("Entities/BugReport/BugReport.route.js"), /requireAuth, loadActor/);
  assert.match(read("Entities/BugReport/BugReport.route.js"), /rateLimit\(/);
  const it = read("Entities/It/It.route.js");
  assert.match(it, /router\.get\("\/bug-reports", requireIt, requirePermission\("permissions\.manage"\)/);
  assert.match(it, /router\.get\("\/bug-reports\/:id\/image", requireIt, requirePermission\("permissions\.manage"\)/);
  assert.match(it, /router\.delete\("\/bug-reports\/:id", requireIt, requirePermission\("permissions\.manage"\)/);
  assert.match(read("server.js"), /recentErrors\.middleware[\s\S]*\/api\/lesson/);
  assert.match(read("middleware/logger.js"), /recentErrors/);
  assert.match(read("utils/errorPublisher.js"), /recentErrors/);
});
