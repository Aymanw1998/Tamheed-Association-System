const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { permissionMiddlewareStub } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

const ADMIN = { _id: "a".repeat(24), tz: "111111118", firstname: "Ad", lastname: "Min", roles: ["ادارة"], email: "admin@example.com" };
const GUIDE = { _id: "b".repeat(24), tz: "222222226", firstname: "Gu", lastname: "Ide", roles: ["مرشد"], vehiclePermissions: ["view", "compliance"] };
// Granted only notices.view: may read the board, not post or run the check.
const READER = { _id: "c".repeat(24), tz: "333333334", firstname: "Re", lastname: "Ader", roles: ["مساعد"], permissionGrants: ["notices.view"], email: "reader@example.com" };
// An administrator whose notices access was revoked.
const REVOKED = { _id: "d".repeat(24), tz: "444444442", firstname: "Re", lastname: "Voked", roles: ["ادارة"], permissionRevokes: ["notices"], email: "revoked@example.com" };

function load(file, dependencies) {
  const filename = path.join(__dirname, "../Entities/Notice", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, process, Date,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

function setup() {
  const rows = [];
  let next = 1;
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) =>
    v && typeof v === "object" && "$regex" in v ? new RegExp(v.$regex).test(doc[k] || "")
      : v && typeof v === "object" && "$exists" in v ? (doc[k] !== undefined && doc[k] !== null) === v.$exists
      : String(doc[k]) === String(v));
  const NoticeModelDef = {
    async get(filter = {}) { return { result: rows.filter((r) => matches(r, filter)).map((r) => structuredClone(r)) }; },
    async create(data) {
      if (data.dedupKey && rows.some((r) => r.dedupKey === data.dedupKey)) { const e = new Error("dup"); e.code = 11000; throw e; }
      const doc = { _id: String(next++).padStart(24, "0"), ...structuredClone(data) }; rows.push(doc); return { result: structuredClone(doc) };
    },
    async update(filter, patch) { rows.forEach((r, i) => { if (matches(r, filter)) rows[i] = { ...r, ...structuredClone(patch) }; }); return { result: null }; },
  };
  const users = [ADMIN, GUIDE, READER, REVOKED];
  const common = {
    "../User/User.model.js": { UserModelDef: { async get(f = {}) { return { result: users.filter((u) => !f.tz || u.tz === f.tz) }; } } },
    "../../utils/vehicleRules.js": require("../utils/vehicleRules"),
    "../../utils/textEncoding.js": require("../utils/textEncoding"),
    "../../utils/permissions.js": require("../utils/permissions"),
    "../../middleware/logger.js": { logWithSource() {} },
  };
  const audit = auditStub();
  const service = load("Notice.service.js", { ...common, "./Notice.model.js": { NoticeModelDef } });
  const controller = load("Notice.controller.js", {
    ...common,
    ...audit.deps,
    "./Notice.service.js": service,
    "../../services/vehicleExpiryJob.js": { async runVehicleExpiryCheck() { return { created: 0, emailed: 0 }; } },
  });
  return { service, controller, rows, audit, routes: loadRoutes(controller) };
}

// The real Notice router, recording each route's chain (router.use first).
// Authentication is assumed; loadActor builds the actor from req.user.
function loadRoutes(controller) {
  const routes = [];
  const uses = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers: [...uses, ...handlers] });
  const router = { use: (...h) => uses.push(...h), get: record("get"), post: record("post"), put: record("put"), delete: record("delete") };
  load("Notice.route.js", {
    express: { Router: () => router },
    "./Notice.controller": controller,
    "../../middleware/authMiddleware": { requireAuth: (req, res, next) => next() },
    "../../middleware/permissionMiddleware": permissionMiddlewareStub(),
    "../../middleware/rateLimit": { rateLimit: () => (req, res, next) => next() },
  });
  return routes;
}

const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
// req.user plays the DB user for loadActor, so it carries grants/revokes too.
const as = (user, extra = {}) => ({
  user: { id: user._id, tz: user.tz, roles: user.roles, permissionGrants: user.permissionGrants, permissionRevokes: user.permissionRevokes },
  params: {}, query: {}, body: {}, ...extra,
});

// Runs the route whose last handler is controller[handler], through its guards.
async function guarded({ controller, routes }, user, handler, req = {}) {
  const route = routes.find((r) => r.handlers[r.handlers.length - 1] === controller[handler]);
  assert.ok(route, `no route for ${handler}`);
  const r = res();
  const request = as(user, req);
  for (const fn of route.handlers) {
    let proceeded = false;
    await fn(request, r, () => { proceeded = true; });
    if (!proceeded) break;
  }
  return r;
}

test("without notices permissions every notice route is 403, even with vehicle permissions", async () => {
  const ctx = setup();
  for (const handler of ["list", "unreadCount", "create", "read", "readAll", "archive", "runVehicleCheck"]) {
    for (const user of [GUIDE, REVOKED]) {
      const r = await guarded(ctx, user, handler);
      assert.equal(r.statusCode, 403, `${handler} as ${user.lastname}`);
      assert.equal(r.body.code, "FORBIDDEN", handler);
    }
  }
});

test("notices.view alone reads the board but cannot post, archive or run the vehicle check", async () => {
  const ctx = setup();
  const { notice } = await ctx.service.publishNotice({ title: "t", body: "b", category: "system", severity: "info" });
  assert.equal((await guarded(ctx, READER, "list")).statusCode, 200);
  assert.equal((await guarded(ctx, READER, "unreadCount")).body.count, 1);
  assert.equal((await guarded(ctx, READER, "read", { params: { id: notice._id } })).statusCode, 200);
  assert.equal((await guarded(ctx, READER, "readAll")).statusCode, 200);
  for (const handler of ["create", "archive", "runVehicleCheck"]) {
    assert.equal((await guarded(ctx, READER, handler, { params: { id: notice._id }, body: { title: "x" } })).statusCode, 403, handler);
  }
});

test("an admin posts a manual notice and it is unread for others", async () => {
  const ctx = setup();
  const created = await guarded(ctx, ADMIN, "create", { body: { title: "اجتماع", body: "غدًا 10:00", severity: "important" } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.notice.category, "manual");
  const list = await guarded(ctx, ADMIN, "list");
  assert.equal(list.body.notices.length, 1);
  assert.equal(list.body.notices[0].read, true); // the author has read their own notice
});

test("manual notice validation", async () => {
  const ctx = setup();
  const bad = await guarded(ctx, ADMIN, "create", { body: { title: "", body: "x".repeat(2001), severity: "loud" } });
  assert.equal(bad.statusCode, 400);
  assert.ok(bad.body.errors.title && bad.body.errors.body && bad.body.errors.severity);
});

test("publishNotice ignores a duplicate dedupKey", async () => {
  const { service, rows } = setup();
  const n = { title: "t", body: "b", category: "vehicle", severity: "info", dedupKey: "vehicle:1:license:due60:2026-12-13" };
  assert.equal((await service.publishNotice(n)).created, true);
  assert.equal((await service.publishNotice(n)).created, false);
  assert.equal(rows.length, 1);
});

test("mark read, unread count and archive", async () => {
  const ctx = setup();
  const { service } = ctx;
  const { notice } = await service.publishNotice({ title: "t", body: "b", category: "system", severity: "info" });
  assert.equal((await guarded(ctx, ADMIN, "unreadCount")).body.count, 1);
  await guarded(ctx, ADMIN, "read", { params: { id: notice._id } });
  assert.equal((await guarded(ctx, ADMIN, "unreadCount")).body.count, 0);
  await guarded(ctx, ADMIN, "archive", { params: { id: notice._id } });
  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
});

test("listNoticeRecipients returns users holding notices.view with a valid email only", async () => {
  const { service } = setup();
  const recipients = await service.listNoticeRecipients();
  // JSON round-trip: arrays from the vm context have a different prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(recipients.map((a) => a.email))), ["admin@example.com", "reader@example.com"]);
});

test("posting and archiving a notice are recorded in the audit log", async () => {
  const ctx = setup();
  const created = await guarded(ctx, ADMIN, "create", { body: { title: "اجتماع", body: "غدًا", severity: "info" } });
  const id = created.body.notice._id;
  const [made] = ctx.audit.find({ module: "notices", action: "create", targetId: id });
  assert.ok(made, "create recorded");
  assert.equal(made.targetType, "notice");
  assert.equal(made.targetLabel, "اجتماع");
  assert.equal(made.after.title, "اجتماع");

  await guarded(ctx, ADMIN, "archive", { params: { id } });
  const [archived] = ctx.audit.find({ module: "notices", action: "update", targetId: id });
  assert.ok(archived, "archive recorded");
  assert.equal(archived.before.archivedAt, undefined);
  assert.ok(archived.after.archivedAt);

  // A rejected action records nothing.
  const count = ctx.audit.calls.length;
  await guarded(ctx, ADMIN, "create", { body: { title: "" } });
  await guarded(ctx, ADMIN, "archive", { params: { id } });
  assert.equal(ctx.audit.calls.length, count);
});
