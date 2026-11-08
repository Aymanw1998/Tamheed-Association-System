const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { permissionMiddlewareStub, actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { createAlertEngine } = require("../services/alertEngine");

const ADMIN = { _id: "a".repeat(24), tz: "111111118", firstname: "Ad", lastname: "Min", roles: ["ادارة"], email: "admin@example.com" };
const GUIDE = { _id: "b".repeat(24), tz: "222222226", firstname: "Gu", lastname: "Ide", roles: ["مرشد"], vehiclePermissions: ["view", "compliance"] };
// Granted only notices.view: may read the board, not post or run the check.
const READER = { _id: "c".repeat(24), tz: "333333334", firstname: "Re", lastname: "Ader", roles: ["مساعد"], permissionGrants: ["notices.view"], email: "reader@example.com" };
// An administrator whose notices access was revoked.
const REVOKED = { _id: "d".repeat(24), tz: "444444442", firstname: "Re", lastname: "Voked", roles: ["ادارة"], permissionRevokes: ["notices"], email: "revoked@example.com" };

test("notice pages preserve visibility, expiry and the page limit", async () => {
  const ctx = setup();
  for (let i = 0; i < 205; i += 1) ctx.rows.push({ _id: String(i).padStart(24, "0"), title: `notice ${i}`, createdAt: new Date(Date.UTC(2026, 10, 7, 0, i)).toISOString(), readBy: [], archivedAt: null });
  ctx.rows.push({ _id: "f".repeat(24), title: "Expired", createdAt: "2099-01-01", expireAt: new Date("2020-01-01"), readBy: [] });
  const first = await guarded(ctx, READER, "list");
  const next = await guarded(ctx, READER, "list", { query: { skip: "200" } });
  assert.equal(first.body.notices.length, 200);
  assert.equal(next.body.notices.length, 5);
  assert.ok(!next.body.notices.some((row) => first.body.notices.some((other) => other._id === row._id)));
  assert.equal((await guarded(ctx, REVOKED, "list", { query: { skip: "200" } })).statusCode, 403);
  for (const skip of ["-1", "1.5", "invalid"]) assert.equal((await guarded(ctx, READER, "list", { query: { skip } })).statusCode, 400);
});

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

function setup({ extraUsers = [], pushFails = false } = {}) {
  const rows = [];
  let next = 1;
  // The MongoDB filter subset the service sends: $and/$or, null matching a
  // missing field, arrays matching any element, $ne/$gt/$regex/$exists.
  const same = (a, b) => (a == null || b == null ? a == null && b == null : String(a instanceof Date ? a.toISOString() : a) === String(b instanceof Date ? b.toISOString() : b));
  const holds = (value, cond) => {
    if (cond && typeof cond === "object" && !(cond instanceof Date)) return Object.entries(cond).every(([op, arg]) => {
      if (op === "$regex") return new RegExp(arg).test(value || "");
      if (op === "$exists") return (value !== undefined && value !== null) === arg;
      if (op === "$ne") return !holds(value, arg);
      if (op === "$gt") return value != null && new Date(value) > new Date(arg);
      throw new Error(`unsupported operator ${op}`);
    });
    return Array.isArray(value) ? value.some((v) => same(v, cond)) : same(value, cond);
  };
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) =>
    k === "$and" ? v.every((part) => matches(doc, part)) : k === "$or" ? v.some((part) => matches(doc, part)) : holds(doc[k], v));
  const NoticeModelDef = {
    async get(filter = {}) { return { result: rows.filter((r) => matches(r, filter)).map((r) => structuredClone(r)) }; },
    async create(data) {
      if (data.dedupKey && rows.some((r) => r.dedupKey === data.dedupKey)) { const e = new Error("dup"); e.code = 11000; throw e; }
      const doc = { _id: String(next++).padStart(24, "0"), ...structuredClone(data) }; rows.push(doc); return { result: structuredClone(doc) };
    },
    async update(filter, patch) { rows.forEach((r, i) => { if (matches(r, filter)) rows[i] = { ...r, ...structuredClone(patch) }; }); return { result: null }; },
    async updateIf(filter, patch) { const i = rows.findIndex((r) => matches(r, filter)); if (i < 0) return null; rows[i] = { ...rows[i], ...structuredClone(patch) }; return structuredClone(rows[i]); },
    async remove(filter) { const before = rows.length; for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], filter)) rows.splice(i, 1); return before - rows.length; },
    async markReadMany(ids, reader, at) { for (const row of rows) if (ids.includes(row._id) && !(row.readBy || []).includes(reader)) { row.readBy = [...(row.readBy || []), reader]; row.readTimes = { ...(row.readTimes || {}), [reader]: at }; } },
    async setHidden(id, reader, hidden) { const row = rows.find((r) => r._id === id); if (row) { const readers = new Set(row.hiddenBy || []); hidden ? readers.add(reader) : readers.delete(reader); row.hiddenBy = [...readers]; } },
  };
  const users = [ADMIN, GUIDE, READER, REVOKED, ...extraUsers];
  const common = {
    "../User/User.model.js": { UserModelDef: { async get(f = {}) { return { result: users.filter((u) => !f.tz || u.tz === f.tz) }; } } },
    "../../utils/vehicleRules.js": require("../utils/vehicleRules"),
    "../../utils/textEncoding.js": require("../utils/textEncoding"),
    "../../utils/permissions.js": require("../utils/permissions"),
    "../../middleware/logger.js": { logWithSource() {} },
  };
  const audit = auditStub();
  const pushes = [];
  const engine = createAlertEngine({ listActiveUsers: async () => users.map((u) => ({ ...u })), findStudentById: async () => null, lessonsWithStudent: async () => [], store: {} });
  const service = load("Notice.service.js", { ...common, "./Notice.model.js": { NoticeModelDef } });
  const controller = load("Notice.controller.js", {
    ...common,
    ...audit.deps,
    "./Notice.service.js": service,
    "../../services/alertEngine.js": engine,
    "../../utils/push.js": { push: { async sendToStaff(...args) { if (pushFails) throw new Error("push down"); pushes.push(args); return { sent: 1, removed: 0 }; } } },
    "../../services/vehicleExpiryJob.js": { async runVehicleExpiryCheck() { return { created: 0, emailed: 0 }; } },
  });
  return { service, controller, rows, audit, pushes, model: NoticeModelDef, routes: loadRoutes(controller) };
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
test("trash purges after 30 days, restores the end date, and permanent delete needs notices.purge", async () => {
  const ctx = setup();
  const ends = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const { notice } = await ctx.service.publishNotice({ title: "Synthetic", body: "", category: "manual", severity: "info", endDate: "2099-01-01", expireAt: ends });
  const params = { id: notice._id };
  const before = Date.now();
  assert.equal((await guarded(ctx, ADMIN, "trash", { params })).statusCode, 200);
  const purgeAt = ctx.rows[0].expireAt.getTime();
  assert.ok(purgeAt >= before + ctx.service.TRASH_KEEP_MS && purgeAt <= Date.now() + ctx.service.TRASH_KEEP_MS);
  assert.equal(ctx.rows[0].keptExpireAt.getTime(), ends.getTime());
  assert.equal((await guarded(ctx, ADMIN, "trash", { params })).statusCode, 404, "already in the trash");
  await guarded(ctx, ADMIN, "restore", { params });
  assert.equal(ctx.rows[0].expireAt.getTime(), ends.getTime()); assert.equal(ctx.rows[0].keptExpireAt, null);
  // An end date sooner than the purge stays the deletion time.
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
  ctx.rows[0].expireAt = soon;
  await guarded(ctx, ADMIN, "trash", { params });
  assert.equal(ctx.rows[0].expireAt.getTime(), soon.getTime());
  // Without an end date a restore leaves none.
  const plain = (await ctx.service.publishNotice({ title: "Plain", body: "", category: "manual", severity: "info" })).notice;
  await guarded(ctx, ADMIN, "trash", { params: { id: plain._id } });
  assert.ok(ctx.rows[1].expireAt instanceof Date);
  await guarded(ctx, ADMIN, "restore", { params: { id: plain._id } });
  assert.equal(ctx.rows[1].expireAt, null);
  // Purge: only from the trash, only with notices.purge.
  assert.equal((await guarded(ctx, ADMIN, "purge", { params: { id: plain._id } })).statusCode, 404, "not in the trash");
  const noPurge = { ...ADMIN, permissionRevokes: ["notices.purge"] };
  assert.equal((await guarded(ctx, noPurge, "purge", { params })).statusCode, 403);
  assert.equal((await guarded(ctx, READER, "purge", { params })).statusCode, 403);
  assert.equal(ctx.rows.length, 2);
  assert.equal((await guarded(ctx, ADMIN, "purge", { params })).statusCode, 200);
  assert.deepEqual(ctx.rows.map((row) => row.title), ["Plain"]);
  assert.ok(ctx.audit.calls.some((r) => r.action === "delete" && r.targetId === notice._id));
});

// Runs fn once right after the next read of a notice (another request acting in between).
const afterNextRead = (ctx, fn) => {
  const get = ctx.model.get;
  ctx.model.get = async function (...args) { const found = await get.apply(this, args); ctx.model.get = get; await fn(); return found; };
};

test("trash, restore and purge racing each other never leave a mixed or recreated notice", async () => {
  const ctx = setup();
  const { notice } = await ctx.service.publishNotice({ title: "Race", body: "", category: "manual", severity: "info" });
  const params = { id: notice._id };
  // Archived; a restore reads it, then a trash lands before the restore writes.
  await guarded(ctx, ADMIN, "archive", { params });
  afterNextRead(ctx, () => ctx.service.changeNoticeState(notice._id, ADMIN, "delete"));
  assert.equal((await guarded(ctx, ADMIN, "restore", { params })).statusCode, 404);
  assert.ok(ctx.rows[0].deletedAt && ctx.rows[0].expireAt instanceof Date, "still in the trash, purge date intact");
  // A restore reads the trashed notice, then a purge deletes it: no row comes back.
  afterNextRead(ctx, () => ctx.service.purgeNotice(notice._id));
  assert.equal((await guarded(ctx, ADMIN, "restore", { params })).statusCode, 404);
  assert.equal(ctx.rows.length, 0);
  // A purge reads a trashed notice, then a restore brings it back: nothing deleted, no audit.
  const other = (await ctx.service.publishNotice({ title: "Kept", body: "", category: "manual", severity: "info" })).notice;
  await guarded(ctx, ADMIN, "trash", { params: { id: other._id } });
  afterNextRead(ctx, () => ctx.service.changeNoticeState(other._id, ADMIN, "restore"));
  assert.equal((await guarded(ctx, ADMIN, "purge", { params: { id: other._id } })).statusCode, 404);
  assert.equal(ctx.rows.length, 1); assert.equal(ctx.rows[0].deletedAt, null);
  assert.ok(!ctx.audit.calls.some((r) => r.action === "delete" && r.targetId === other._id));
});

test("read-all marks every unread visible notice in one update and skips hidden ones", async () => {
  const ctx = setup();
  let bulk = 0; const many = ctx.model.markReadMany; ctx.model.markReadMany = async function (...args) { bulk += 1; return many.apply(this, args); };
  for (const title of ["one", "two", "hidden"]) await ctx.service.publishNotice({ title, body: "", category: "manual", severity: "info" });
  ctx.rows[2].hiddenBy = [READER._id];
  assert.equal((await guarded(ctx, READER, "unreadCount")).body.count, 2);
  assert.equal((await guarded(ctx, READER, "readAll")).body.updated, 2);
  assert.equal((await guarded(ctx, READER, "unreadCount")).body.count, 0);
  assert.ok(!ctx.rows[2].readBy.includes(READER._id));
  assert.ok(ctx.rows[0].readTimes[READER._id]);
  assert.equal(bulk, 1, "one bulk update for a real ObjectId reader");
});

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
  const { notice } = await service.publishNotice({ title: "t", body: "b", category: "manual", severity: "info" });
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

/* ================= the system account ================= */

// A synthetic, checksum-valid ID number (not a real person).
const SYSTEM_TZ = "000000026";
const SYS = { _id: "e".repeat(24), tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem", roles: [], email: "system@example.com" };

async function withSystemTz(fn) {
  const had = Object.hasOwn(process.env, "SYSTEM_ADMIN_TZ");
  const previous = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
  try { return await fn(); } finally { if (had) process.env.SYSTEM_ADMIN_TZ = previous; else delete process.env.SYSTEM_ADMIN_TZ; }
}

test("the system account is never a notice recipient", async () => {
  await withSystemTz(async () => {
    const { service } = setup({ extraUsers: [SYS] });
    const recipients = JSON.parse(JSON.stringify(await service.listNoticeRecipients()));
    assert.deepEqual(recipients.map((a) => a.email), ["admin@example.com", "reader@example.com"]);
  });
});

test("a notice posted by the system is stored as \"system\" / \"النظام\" and read by its author", async () => {
  await withSystemTz(async () => {
    const ctx = setup({ extraUsers: [SYS] });
    const out = res();
    await ctx.controller.create({ ...as(SYS), actor: actorFor(SYS, { isSystem: true }), body: { title: "t", body: "b", severity: "info" } }, out);
    assert.equal(out.statusCode, 201);
    assert.equal(ctx.rows[0].createdBy, "system");
    assert.equal(ctx.rows[0].createdByName, "النظام");
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.rows[0].readBy)), [SYS._id]);
    assert.ok(!JSON.stringify(ctx.rows).includes(SYSTEM_TZ));
    assert.ok(!JSON.stringify(ctx.rows).includes("Sys Tem"));
  });
});

test("a new notice pushes its title to every notices.view holder except the author", async () => {
  const ctx = setup();
  const r = await guarded(ctx, ADMIN, "create", { body: { title: "اجتماع", body: "غدًا", severity: "info" } });
  assert.equal(r.statusCode, 201);
  await new Promise((resolve) => setImmediate(resolve)); // the push is not awaited by create
  assert.equal(ctx.pushes.length, 1);
  const [tzs, payload] = ctx.pushes[0];
  assert.ok(tzs.includes(READER.tz));
  assert.ok(!tzs.includes(ADMIN.tz), "author excluded");
  assert.ok(!tzs.includes(REVOKED.tz), "no notices access");
  assert.ok(!tzs.includes(GUIDE.tz));
  assert.deepEqual({ ...payload }, { title: "اجتماع", body: "", url: "/notices" });
});

test("a push failure does not fail publishing a notice", async () => {
  const ctx = setup({ pushFails: true });
  const r = await guarded(ctx, ADMIN, "create", { body: { title: "اجتماع", body: "x", severity: "info" } });
  assert.equal(r.statusCode, 201);
});

// Owner, 2026-11-02: a notice may get an end date; a notice someone read is
// gone for them 30 days later, except a vehicle notice, which stays until the
// document is renewed (services/recordAlerts).
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

test("an admin may give a manual notice an end date; after it the notice is gone", async () => {
  const ctx = setup();
  const created = await guarded(ctx, ADMIN, "create", { body: { title: "اجتماع", body: "", severity: "info", endDate: isoDay(10) } });
  assert.equal(created.statusCode, 201);
  assert.equal(ctx.rows[0].endDate, isoDay(10));
  assert.ok(ctx.rows[0].expireAt instanceof Date || typeof ctx.rows[0].expireAt === "object", "a Date for the TTL index");
  assert.ok(new Date(ctx.rows[0].expireAt) > new Date(Date.now() + 9 * DAY_MS));
  assert.equal((await guarded(ctx, READER, "list")).body.notices[0].endDate, isoDay(10));
  ctx.rows[0].expireAt = new Date(Date.now() - 1000);
  assert.equal((await guarded(ctx, READER, "list")).body.notices.length, 0);
  assert.equal((await guarded(ctx, READER, "unreadCount")).body.count, 0);
});

test("without an end date a notice has none; a bad end date is refused", async () => {
  const ctx = setup();
  await guarded(ctx, ADMIN, "create", { body: { title: "x", severity: "info" } });
  assert.equal(ctx.rows[0].expireAt, undefined);
  for (const endDate of ["2026-13-01", "tomorrow", isoDay(-2), isoDay(400)]) {
    const bad = await guarded(ctx, ADMIN, "create", { body: { title: "x", severity: "info", endDate } });
    assert.equal(bad.statusCode, 400, endDate);
    assert.ok(bad.body.errors.endDate, endDate);
  }
});

test("a notice read more than 30 days ago is gone for that reader only", async () => {
  const ctx = setup();
  const { notice } = await ctx.service.publishNotice({ title: "t", body: "b", category: "system", severity: "info" });
  await guarded(ctx, ADMIN, "read", { params: { id: notice._id } });
  assert.ok(ctx.rows[0].readTimes[ADMIN._id], "the time it was read is kept");
  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 1);
  ctx.rows[0].readTimes[ADMIN._id] = new Date(Date.now() - 31 * DAY_MS).toISOString();
  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
  assert.equal((await guarded(ctx, READER, "list")).body.notices.length, 1);
});

test("reading all records the time too, and a vehicle notice stays after 30 days", async () => {
  const ctx = setup();
  await ctx.service.publishNotice({ title: "t", body: "b", category: "vehicle", severity: "info", dedupKey: "vehicle:v:test:due7:2026-11-09" });
  await guarded(ctx, ADMIN, "readAll");
  ctx.rows[0].readTimes[ADMIN._id] = new Date(Date.now() - 90 * DAY_MS).toISOString();
  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 1);
});

test("a notice read before read times were kept counts from when it was posted", async () => {
  const ctx = setup();
  const { notice } = await ctx.service.publishNotice({ title: "t", body: "b", category: "system", severity: "info" });
  const row = ctx.rows.find((r) => r._id === notice._id);
  row.readBy = [ADMIN._id];
  row.createdAt = new Date(Date.now() - 40 * DAY_MS).toISOString();
  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
  assert.equal((await guarded(ctx, READER, "list")).body.notices.length, 1);
});

test("manual notices archive, trash and restore while automatic notices have only personal dismissal", async () => {
  const ctx = setup();
  const { notice } = await ctx.service.publishNotice({ title: "Synthetic", body: "", category: "manual", severity: "info" });
  const params = { id: notice._id };
  assert.equal((await guarded(ctx, READER, "trash", { params })).statusCode, 403);
  assert.equal((await guarded(ctx, ADMIN, "archive", { params })).statusCode, 200);
  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
  assert.equal((await guarded(ctx, ADMIN, "list", { query: { status: "archived" } })).body.notices.length, 1);
  await guarded(ctx, ADMIN, "restore", { params }); await guarded(ctx, ADMIN, "trash", { params });
  assert.equal((await guarded(ctx, READER, "list", { query: { status: "deleted" } })).body.notices.length, 0);
  assert.equal((await guarded(ctx, ADMIN, "list", { query: { status: "deleted" } })).body.notices.length, 1);
  await guarded(ctx, ADMIN, "restore", { params });
  assert.equal((await guarded(ctx, READER, "list")).body.notices.length, 1);
  ctx.rows[0].category = "system";
  assert.equal((await guarded(ctx, ADMIN, "trash", { params })).statusCode, 404);
  assert.equal((await guarded(ctx, ADMIN, "archive", { params })).statusCode, 404);
  await Promise.all([guarded(ctx, ADMIN, "hide", { params }), guarded(ctx, READER, "hide", { params })]);
  assert.equal(ctx.rows[0].hiddenBy.length, 2);
  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
  const ownTrash = await guarded(ctx, READER, "list", { query: { status: "deleted" } });
  assert.equal(ownTrash.body.notices[0].hiddenForMe, true); assert.equal(ownTrash.body.notices[0].hiddenBy, undefined);
  await guarded(ctx, READER, "unhide", { params });
  assert.equal((await guarded(ctx, READER, "list")).body.notices.length, 1);
  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
  const revoked = { ...READER, permissionRevokes: ["alerts.dismiss"] };
  assert.equal((await guarded(ctx, revoked, "hide", { params })).statusCode, 403);
});
