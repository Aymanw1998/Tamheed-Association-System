const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createLoadActor, requirePermission, actorLabel } = require("../middleware/permissionMiddleware");
const { LOCKED_MESSAGE } = require("../utils/loginLockout");

const SYSTEM_TZ = "SYS-TEST";

// `users` maps tz -> DB user (mutable so tests can change it between requests).
async function startApp(users, routeKeys = ["students.edit"]) {
  const loadActor = createLoadActor({
    systemTz: SYSTEM_TZ,
    findActiveUserByTz: async (tz) => users[tz] || null,
  });
  const app = express();
  app.use((req, res, next) => {
    req.user = { id: "id-" + req.headers["x-tz"], tz: req.headers["x-tz"], roles: ["ادارة"] };
    next();
  });
  app.use(loadActor);
  app.get("/guarded", requirePermission(...routeKeys), (req, res) =>
    res.json({ ok: true, label: actorLabel(req.actor) }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const get = (base, tz) => fetch(`${base}/guarded`, { headers: { "x-tz": tz } });

test("a permission revoked in the DB blocks the very next request", async () => {
  const users = { u1: { tz: "u1", firstname: "A", lastname: "B", role: "ادارة" } };
  const { server, base } = await startApp(users);
  try {
    assert.equal((await get(base, "u1")).status, 200);
    users.u1.permissionRevokes = ["students.edit"];
    const res = await get(base, "u1");
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { code: "FORBIDDEN", message: "لا توجد صلاحية" });
  } finally { server.close(); }
});

test("a user no longer in the active room gets 401 NO_ACTIVE", async () => {
  const users = { u1: { tz: "u1", role: "ادارة" } };
  const { server, base } = await startApp(users);
  try {
    delete users.u1;
    const res = await get(base, "u1");
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, "NO_ACTIVE");
  } finally { server.close(); }
});

test("the system account passes any key and is labelled system", async () => {
  const users = { [SYSTEM_TZ]: { tz: SYSTEM_TZ, lockedAt: new Date() } };
  const { server, base } = await startApp(users, ["systemRecovery.reset", "permissions.manage"]);
  try {
    const res = await get(base, SYSTEM_TZ);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).label, { actor: "system", actorName: "النظام" });
  } finally { server.close(); }
});

test("requirePermission passes when any one of several keys is held", async () => {
  const users = { m1: { tz: "m1", role: "مرشد" } };
  const { server, base } = await startApp(users, ["reports.viewAll", "reports.editOwn"]);
  try {
    assert.equal((await get(base, "m1")).status, 200);
  } finally { server.close(); }
});

test("a locked non-system account is refused with 423 ACCOUNT_LOCKED", async () => {
  const users = { u1: { tz: "u1", role: "ادارة", lockedAt: new Date() } };
  const { server, base } = await startApp(users);
  try {
    const res = await get(base, "u1");
    assert.equal(res.status, 423);
    assert.deepEqual(await res.json(), { code: "ACCOUNT_LOCKED", message: LOCKED_MESSAGE });
  } finally { server.close(); }
});

test("actorLabel uses the full name for users and falls back to the tz", () => {
  assert.deepEqual(
    actorLabel({ isSystem: false, tz: "t1", name: "Ann Lee" }),
    { actor: "t1", actorName: "Ann Lee" });
  assert.deepEqual(
    actorLabel({ isSystem: false, tz: "t1", name: "" }),
    { actor: "t1", actorName: "t1" });
});

test("a roles-only (unmigrated) user gets the resolved role on req.actor", async () => {
  const loadActor = createLoadActor({
    systemTz: SYSTEM_TZ,
    findActiveUserByTz: async () => ({ tz: "u1", roles: ["الإدارة"] }),
  });
  const req = { user: { tz: "u1" } };
  await loadActor(req, {}, () => {});
  assert.equal(req.actor.role, "ادارة");
  assert.ok(req.actor.permissions.has("students.edit"));
});

test("missing req.user gets 401 NO_ACTIVE", async () => {
  const loadActor = createLoadActor({ systemTz: SYSTEM_TZ, findActiveUserByTz: async () => ({ tz: "x" }) });
  let status; let body;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; } };
  await loadActor({}, res, () => assert.fail("next called"));
  assert.equal(status, 401);
  assert.equal(body.code, "NO_ACTIVE");
});

test("a lookup failure goes to next(error), not a 401", async () => {
  const boom = new Error("db down");
  const loadActor = createLoadActor({ systemTz: SYSTEM_TZ, findActiveUserByTz: async () => { throw boom; } });
  let got;
  const res = { status() { assert.fail("responded"); } };
  await loadActor({ user: { tz: "u1" } }, res, (e) => { got = e; });
  assert.equal(got, boom);
});

test("req.actor carries the DB user's id for handlers that record who acted", async () => {
  const loadActor = createLoadActor({
    systemTz: SYSTEM_TZ,
    findActiveUserByTz: async () => ({ _id: "db-id-1", tz: "u1", role: "مرشد" }),
  });
  const req = { user: { tz: "u1" } };
  await loadActor(req, {}, () => {});
  assert.equal(req.actor.id, "db-id-1");
});

function runGuard(guard, req) {
  let status = 200; let body; let passed = false;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  guard(req, res, () => { passed = true; });
  return { passed, status, body };
}

test("requireSelfOr lets a user act on their own tz or id, others need one of the keys", () => {
  const { requireSelfOr } = require("../middleware/permissionMiddleware");
  const guard = requireSelfOr("tz", "users.edit");
  const self = { tz: "t1", user: { _id: "id-1" }, permissions: new Set() };
  assert.equal(runGuard(guard, { params: { tz: "t1" }, actor: self }).passed, true);
  assert.equal(runGuard(guard, { params: { tz: "id-1" }, actor: self }).passed, true);

  const denied = runGuard(guard, { params: { tz: "t2" }, actor: self });
  assert.equal(denied.passed, false);
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.body, { code: "FORBIDDEN", message: "لا توجد صلاحية" });

  const editor = { tz: "t9", user: { _id: "id-9" }, permissions: new Set(["users.edit"]) };
  assert.equal(runGuard(guard, { params: { tz: "t2" }, actor: editor }).passed, true);
});

test("requireSelfOr never treats a blank target or a missing actor as self", () => {
  const { requireSelfOr } = require("../middleware/permissionMiddleware");
  const guard = requireSelfOr("tz", "users.edit");
  const blank = { tz: "", user: {}, permissions: new Set() };
  assert.equal(runGuard(guard, { params: { tz: "" }, actor: blank }).passed, false);
  assert.equal(runGuard(guard, { params: { tz: "t1" } }).passed, false);
});
