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
  // Rows loadActor serves instead of the live one (a snapshot taken before an
  // earlier write landed), to reproduce two overlapping requests.
  const stale = {};
  // Rows that vanish between the read and the write (the write then matches nothing).
  const gone = new Set();
  const users = {
    async get(filter) {
      const row = db[filter.tz];
      return { success: true, result: row ? [{ ...row }] : [] };
    },
    // Mirrors api.updateExisting: $set semantics (a dotted key sets a nested
    // field) and never creates a row.
    async updateExisting(filter, patch) {
      updates.push({ filter, patch });
      const row = gone.has(filter.tz) ? undefined : db[filter.tz];
      if (!row) return { success: true, result: null };
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split(".");
        let target = row;
        for (const part of parts.slice(0, -1)) {
          if (target[part] === undefined) target[part] = {};
          target = target[part];
        }
        target[parts[parts.length - 1]] = value;
      }
      return { success: true, result: { ...row } };
    },
  };
  const requireAuth = (req, res, next) => {
    if (!req.headers["x-tz"]) return res.status(401).json({ code: "NO_TOKEN" });
    return next();
  };
  const loadActor = (req, res, next) => {
    const row = stale[req.headers["x-tz"]] || db[req.headers["x-tz"]];
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
  return { server, db, audits, updates, stale, gone, call, base };
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

test("POST /item/:id writes only its own entry, so overlapping writes keep each other", async () => {
  const { server, db, updates, stale, call } = await startApp();
  try {
    // Both requests read the helper before either write lands.
    stale["t-helper"] = structuredClone(db["t-helper"]);
    assert.equal((await call("helper", "POST", "/item/dashboard", { status: "done", version: 1 })).status, 200);
    assert.equal((await call("helper", "POST", "/item/students", { status: "skipped", version: 1 })).status, 200);
    assert.deepEqual(Object.keys(updates[0].patch), ["tours.dashboard"]);
    assert.deepEqual(Object.keys(updates[1].patch), ["tours.students"]);
    const tours = db["t-helper"].tours;
    assert.equal(tours.dashboard.status, "done");
    assert.equal(tours.students.status, "skipped");
    assert.equal(tours.welcome.status, "done");
    assert.equal(tours.extra.status, "skipped");
  } finally { server.close(); }
});

test("POST /item/:id writes a whole tours object when the stored one is unusable", async () => {
  const { server, db, updates, call } = await startApp();
  try {
    db["t-guide"].tours = null;
    assert.equal((await call("guide", "POST", "/item/welcome", { status: "done", version: 1 })).status, 200);
    assert.deepEqual(Object.keys(updates[0].patch), ["tours"]);
    assert.equal(db["t-guide"].tours.welcome.status, "done");
  } finally { server.close(); }
});

test("tour writes never create a user row", async () => {
  const { server, db, stale, call } = await startApp();
  try {
    // The caller was signed in but the row is gone by the time of the write.
    stale["t-guide"] = structuredClone(db["t-guide"]);
    delete db["t-guide"];
    const res = await call("guide", "POST", "/item/welcome", { status: "done", version: 1 });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "NOT_FOUND");
    assert.equal(db["t-guide"], undefined);
    assert.equal((await call("guide", "POST", "/known-keys", { keys: ["dashboard"] })).status, 404);
    assert.equal((await call("guide", "POST", "/releases/seen", { ids: ["r-one"] })).status, 404);
    assert.equal(db["t-guide"], undefined);
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

test("POST /known-keys rejects a non-array without writing", async () => {
  const { server, updates, call } = await startApp();
  try {
    for (const body of [{ keys: "dashboard" }, { keys: { 0: "dashboard" } }, {}, undefined]) {
      const res = await call("helper", "POST", "/known-keys", body);
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, "BAD_INPUT");
    }
    assert.equal(updates.length, 0);
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

test("POST /reset/:tz answers 404 without an audit row when the write matches nothing", async () => {
  const { server, audits, gone, call } = await startApp();
  try {
    gone.add("t-helper");
    const res = await call("admin", "POST", "/reset/t-helper");
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "NOT_FOUND");
    assert.equal(audits.length, 0);
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
