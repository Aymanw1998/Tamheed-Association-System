const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { effectivePermissions } = require("../utils/permissions");
const pm = require("../middleware/permissionMiddleware");
const { createConsentScope } = require("../middleware/consentScope");
const { canSeeAlertType } = require("../services/alertAccess");

test("weekly-task alerts follow current task visibility, including after revocation", () => {
  for (const type of ["weekly_tasks", "weekly_task_added", "weekly_tasks_overdue", "weekly_tasks_greeting"]) {
    assert.equal(canSeeAlertType({ permissions: effectivePermissions({ role: "مرشد" }) }, type), true);
    assert.equal(canSeeAlertType({ permissions: effectivePermissions({ role: "مرشد", permissionRevokes: ["tasks.view"] }) }, type), false);
  }
});

function fixture(entity) {
  const calls = [];
  const noop = (req, res, next) => next();
  const handler = (name) => (req, res) => { calls.push(name); return res.status(200).json({ ok: true }); };
  const controller = new Proxy({}, { get: (_, name) => handler(name) });
  const multer = () => ({ single: () => noop });
  multer.memoryStorage = multer.diskStorage = () => ({});
  const deps = {
    express: require("express"), multer, fs: { mkdirSync() {} }, os: require("node:os"), path,
    "../../middleware/authMiddleware": { requireAuth: noop },
    "../../middleware/permissionMiddleware": { ...pm, loadActor: noop },
    "../../middleware/consentScope": { consentScope: createConsentScope({ visibleStudentIds: async () => new Set(["student"]) }) },
    "../../middleware/rateLimit": { rateLimit: () => noop },
    "../../middleware/logger": { logWithSource() {} },
    "../../middleware/lockGuard": { requireFreeOrMine: () => noop },
    "../../middleware/objectIdParam": { objectIdParam: noop },
    "../../services/weeklyTasks": { weeklyTasks: () => new Proxy({}, { get: (_, name) => async () => { calls.push(name); return {}; } }) },
    [`./${entity}.controller`]: controller,
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../Entities/${entity}/${entity}.route.js`), "utf8"), {
    module, process: { env: {} }, require: (name) => { assert.ok(deps[name], name); return deps[name]; },
  });
  return { calls, async call(method, routePath, { role = "ادارة", grants = [], revokes = [], studentId = "student" } = {}) {
    const route = module.exports.stack.find((entry) => entry.route?.path === routePath && entry.route.methods[method])?.route;
    assert.ok(route, `${method} ${routePath}`);
    const req = { actor: { id: "owner", permissions: effectivePermissions({ role, permissionGrants: grants, permissionRevokes: revokes }) },
      params: { studentId, id: "task", taskId: "task", groupId: "group" }, body: {}, headers: {}, _body: true };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    for (const layer of route.stack) {
      let next = false;
      await layer.handle(req, res, (error) => { if (error) throw error; next = true; });
      if (!next) break;
    }
    return res;
  } };
}

test("rules are independently grantable; parent-link access cannot read or publish them", async () => {
  const f = fixture("InviteToken");
  assert.equal((await f.call("get", "/rules", { role: "مرشد", grants: ["students.parentLink"] })).statusCode, 403);
  assert.equal((await f.call("get", "/rules", { role: "مرشد", grants: ["rules.view"] })).statusCode, 200);
  assert.equal((await f.call("post", "/rules", { role: "مرشد", grants: ["rules.view"] })).statusCode, 403);
  assert.equal((await f.call("post", "/rules", { role: "مرشد", grants: ["rules.edit"] })).statusCode, 200);
  assert.equal((await f.call("post", "/rules", { revokes: ["rules.edit"] })).statusCode, 403);
  assert.equal(f.calls.filter((name) => name === "publishRules").length, 1);
});

test("posting a notice never bypasses a revoked archive operation", async () => {
  const f = fixture("Notice");
  assert.equal((await f.call("post", "/:id/archive", { revokes: ["notices.archive"] })).statusCode, 403);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.call("post", "/:id/archive")).statusCode, 200);
});

test("weekly timetable has its own revocable permission without removing record access", async () => {
  const f = fixture("Lesson");
  for (const route of ["/week-schedule", "/sport-schedule"]) {
    assert.equal((await f.call("get", route, { revokes: ["calendar.view"] })).statusCode, 403);
    assert.deepEqual(f.calls, []);
    assert.equal((await f.call("get", route)).statusCode, 200);
    f.calls.length = 0;
  }
  assert.equal((await f.call("get", "/", { revokes: ["calendar.view"] })).statusCode, 200);
});

test("signature read, replacement and parent link are separate, and keep the student's scope", async () => {
  const f = fixture("InviteToken");
  assert.equal((await f.call("get", "/consent/:studentId", { role: "مرشد", grants: ["consents.view"] })).statusCode, 200);
  assert.equal((await f.call("post", "/consent/:studentId", { role: "مرشد", grants: ["consents.view"] })).statusCode, 403);
  assert.equal((await f.call("post", "/consent/:studentId/link", { role: "مرشد", grants: ["consents.link"] })).statusCode, 200);
  assert.equal((await f.call("post", "/consent/:studentId/link", { role: "مرشد", grants: ["consents.link"], studentId: "other-student" })).statusCode, 404);
  assert.equal((await f.call("get", "/consent/:studentId", { revokes: ["consents.view"] })).statusCode, 403);
  assert.equal(f.calls.filter((name) => name === "createConsentLink").length, 1);
});

for (const [method, route, key] of [
  ["get", "/me", "view"], ["post", "/me/:taskId", "complete"], ["get", "/board", "viewAll"],
  ["post", "/", "create"], ["put", "/:id", "edit"], ["delete", "/:id", "delete"],
  ["post", "/:id/assign/:groupId", "assign"], ["delete", "/:id/assign/:groupId", "assign"],
  ["post", "/:id/approve/:groupId", "approve"], ["post", "/greetings", "greet"],
]) test(`weekly task ${key}: revoked operation never reaches the service`, async () => {
  const f = fixture("WeeklyTask");
  assert.equal((await f.call(method, route, { revokes: [`tasks.${key}`] })).statusCode, 403);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.call(method, route)).statusCode, 200);
  assert.equal(f.calls.length, 1);
});

for (const [method, route, key] of [
  ["post", "/folder", "createFolder"], ["post", "/upload", "upload"], ["post", "/upload-chunk", "upload"],
  ["post", "/merge-chunks", "upload"], ["patch", "/rename", "rename"],
  ["delete", "/delete", "delete"], ["delete", "/*", "delete"], ["post", "/share", "share"], ["post", "/unshare", "share"],
]) test(`files ${route}: files.use cannot bypass revoked ${key}`, async () => {
  const f = fixture("Storage");
  assert.equal((await f.call(method, route, { revokes: [`files.${key}`] })).statusCode, 403);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.call(method, route)).statusCode, 200);
  assert.equal(f.calls.length, 1);
});
