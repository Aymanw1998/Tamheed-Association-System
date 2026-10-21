const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createToursRouter } = require("../routes/tours.routes");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { canManageTarget } = require("../utils/permissionRules");
const { actorFor } = require("./helpers/actors");

// Synthetic identifiers only.
const SYSTEM_TZ = "SYS-TOUR";
const ADMIN = "ادارة";
const GUIDE = "مرشد";
const HELPER = "مساعد";

const ROWS = {
  sys: { _id: "s".repeat(24), tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem" },
  admin: { _id: "a".repeat(24), tz: "t-admin", firstname: "Ad", lastname: "Min", role: ADMIN, roles: [ADMIN] },
  guide: { _id: "g".repeat(24), tz: "t-guide", firstname: "Gu", lastname: "Ide", role: GUIDE, roles: [GUIDE] },
  helper: {
    _id: "h".repeat(24), tz: "t-helper", firstname: "He", lastname: "Lper", role: HELPER, roles: [HELPER],
    tours: { welcome: { status: "done", version: 1 }, extra: { status: "skipped", version: 1 } },
    knownKeys: ["dashboard"], seenReleases: ["r-one"],
  },
};

async function startApp() {
  const db = Object.fromEntries(Object.values(ROWS).map((v) => [v.tz, structuredClone(v)]));
  const audits = [];
  const updates = [];
  const users = {
    async get(filter) {
      const row = db[filter.tz];
      return { success: true, result: row ? [{ ...row }] : [] };
    },
    async update(filter, patch) {
      updates.push({ filter, patch });
      Object.assign(db[filter.tz], patch);
      return { success: true, result: { ...db[filter.tz] } };
    },
  };
  const requireAuth = (req, res, next) => {
    if (!req.headers["x-tz"]) return res.status(401).json({ code: "NO_TOKEN" });
    return next();
  };
  const loadActor = (req, res, next) => {
    const row = db[req.headers["x-tz"]];
    req.actor = actorFor(row, { isSystem: row.tz === SYSTEM_TZ });
    return next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/tours", createToursRouter({
    requireAuth, loadActor, requirePermission, users,
    audit: { record: async (req, entry) => { audits.push(JSON.parse(JSON.stringify(entry))); } },
    canManageTarget,
    isSystemTz: (tz) => tz === SYSTEM_TZ,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/tours`;
  const call = (who, method, path, body) => fetch(`${base}${path}`, {
    method,
    headers: { "x-tz": ROWS[who].tz, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { server, db, audits, updates, call, base };
}

test("rejects anonymous callers", async () => {
  const { server, base } = await startApp();
  try {
    assert.equal((await fetch(base)).status, 401);
  } finally { server.close(); }
});

test("GET / returns the caller's own tour state", async () => {
  const { server, call } = await startApp();
  try {
    const body = await (await call("helper", "GET", "/")).json();
    assert.equal(body.ok, true);
    assert.equal(body.tours.welcome.status, "done");
    assert.deepEqual(body.knownKeys, ["dashboard"]);
    assert.deepEqual(body.seenReleases, ["r-one"]);
    const fresh = await (await call("guide", "GET", "/")).json();
    assert.deepEqual(fresh.tours, {});
    assert.equal(fresh.knownKeys, null);
    assert.deepEqual(fresh.seenReleases, []);
  } finally { server.close(); }
});

test("POST /item/:id stores the tour status and keeps the others", async () => {
  const { server, db, call } = await startApp();
  try {
    const res = await call("helper", "POST", "/item/students", { status: "done", version: 2 });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.tours.students.status, "done");
    assert.equal(body.tours.students.version, 2);
    assert.equal(body.tours.welcome.status, "done");
    assert.equal(db["t-helper"].tours.students.status, "done");
  } finally { server.close(); }
});

test("POST /item/:id rejects bad input, including __proto__", async () => {
  const { server, call, updates } = await startApp();
  try {
    for (const [id, body] of [
      ["__proto__", { status: "done", version: 1 }],
      ["students", { status: "nope", version: 1 }],
      ["students", { status: "done", version: 0 }],
      ["students", undefined],
    ]) {
      const res = await call("helper", "POST", `/item/${id}`, body);
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, "BAD_INPUT");
    }
    assert.equal(updates.length, 0);
    assert.equal(Object.prototype.status, undefined);
    assert.equal(({}).status, undefined);
  } finally { server.close(); }
});

test("POST /item/:id answers 409 TOO_MANY past the limit", async () => {
  const { server, db, call } = await startApp();
  try {
    db["t-helper"].tours = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`tour${i}`, { status: "done", version: 1 }]));
    const res = await call("helper", "POST", "/item/another", { status: "done", version: 1 });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, "TOO_MANY");
  } finally { server.close(); }
});

test("POST /known-keys remembers only keys the caller holds", async () => {
  const { server, db, call } = await startApp();
  try {
    const res = await call("helper", "POST", "/known-keys", { keys: ["calendar.view", "users.delete", "dashboard"] });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.knownKeys, ["calendar.view", "dashboard"]);
    assert.deepEqual(db["t-helper"].knownKeys, ["calendar.view", "dashboard"]);
  } finally { server.close(); }
});

test("POST /releases/seen merges ids and rejects a non-array", async () => {
  const { server, call } = await startApp();
  try {
    const ok = await call("helper", "POST", "/releases/seen", { ids: ["r-two"] });
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()).seenReleases, ["r-one", "r-two"]);
    const bad = await call("helper", "POST", "/releases/seen", { ids: "r-three" });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).code, "BAD_INPUT");
  } finally { server.close(); }
});

test("POST /reset/:tz clears tours only and records the audit row", async () => {
  const { server, db, audits, call } = await startApp();
  try {
    const res = await call("admin", "POST", "/reset/t-helper");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(db["t-helper"].tours, {});
    assert.deepEqual(db["t-helper"].knownKeys, ["dashboard"]);
    assert.deepEqual(db["t-helper"].seenReleases, ["r-one"]);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "tours_reset");
    assert.equal(audits[0].module, "users");
    assert.equal(audits[0].targetType, "user");
    assert.equal(audits[0].targetId, "t-helper");
  } finally { server.close(); }
});

test("POST /reset/:tz is refused without users.edit, for the system account and above one's rank", async () => {
  const { server, db, audits, call } = await startApp();
  try {
    assert.equal((await call("helper", "POST", "/reset/t-guide")).status, 403);
    assert.equal((await call("admin", "POST", `/reset/${SYSTEM_TZ}`)).status, 404);
    assert.equal((await call("admin", "POST", "/reset/t-nobody")).status, 404);
    // Grant a guide users.edit so only the rank rule can refuse the admin target.
    db["t-guide"].permissionGrants = ["users.edit"];
    const res = await call("guide", "POST", "/reset/t-admin");
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "FORBIDDEN");
    assert.equal(audits.length, 0);
    assert.equal(Object.keys(db["t-helper"].tours).length, 2);
  } finally { server.close(); }
});
