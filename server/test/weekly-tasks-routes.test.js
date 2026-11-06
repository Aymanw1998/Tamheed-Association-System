const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { effectivePermissions } = require("../utils/permissions");
const { requirePermission, actorLabel } = require("../middleware/permissionMiddleware");

function setup() {
  const calls = [];
  const service = { sendGreeting: async (body, actorId) => { calls.push({ body, actorId }); return { deliveries: [] }; } };
  const module = { exports: {} };
  const deps = {
    express: require("express"),
    "../../middleware/authMiddleware": { requireAuth: (req, res, next) => next() },
    "../../middleware/permissionMiddleware": { requirePermission, actorLabel, loadActor: (req, res, next) => next() },
    "../../middleware/logger": { logWithSource() {} },
    "../../services/weeklyTasks": { weeklyTasks: () => service },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../Entities/WeeklyTask/WeeklyTask.route"), "utf8"), { module, require: (name) => { assert.ok(deps[name], name); return deps[name]; } });
  const route = module.exports.stack.find((entry) => entry.route?.path === "/greetings").route;
  return { calls, async call(role, revokes = []) {
    const req = { actor: { id: "owner", permissions: effectivePermissions({ role, permissionRevokes: revokes }) }, body: { guideIds: ["g1"], text: "Thanks", requestId: "request_123" } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let index = 0;
    const next = () => route.stack[index++]?.handle(req, res, next);
    await next();
    return res;
  } };
}

test("all management members can greet; guide and assistant group owners cannot manage", async () => {
  const ctx = setup();
  assert.equal((await ctx.call("ادارة")).statusCode, 200);
  assert.equal(ctx.calls.length, 1);
  assert.equal((await ctx.call("مرشد")).statusCode, 403);
  assert.equal((await ctx.call("مساعد")).statusCode, 403);
  assert.equal((await ctx.call("ادارة", ["tasks.manage"])).statusCode, 403);
  assert.equal(ctx.calls.length, 1);
});
