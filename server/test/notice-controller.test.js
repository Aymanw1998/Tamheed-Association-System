const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ADMIN = { _id: "a".repeat(24), tz: "111111118", firstname: "Ad", lastname: "Min", roles: ["ادارة"], email: "admin@example.com" };
const GUIDE = { _id: "b".repeat(24), tz: "222222226", firstname: "Gu", lastname: "Ide", roles: ["مرشد"], vehiclePermissions: ["view", "compliance"] };

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
  const users = [ADMIN, GUIDE];
  const common = {
    "../User/User.model.js": { UserModelDef: { async get(f = {}) { return { result: users.filter((u) => !f.tz || u.tz === f.tz) }; } } },
    "../../utils/vehicleRules.js": require("../utils/vehicleRules"),
    "../../utils/textEncoding.js": require("../utils/textEncoding"),
    "../../middleware/logger.js": { logWithSource() {} },
  };
  const service = load("Notice.service.js", { ...common, "./Notice.model.js": { NoticeModelDef } });
  const controller = load("Notice.controller.js", {
    ...common,
    "./Notice.service.js": service,
    "../../services/vehicleExpiryJob.js": { async runVehicleExpiryCheck() { return { created: 0, emailed: 0 }; } },
  });
  return { service, controller, rows };
}

const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const as = (user, extra = {}) => ({ user: { id: user._id, tz: user.tz, roles: user.roles }, params: {}, query: {}, body: {}, ...extra });

async function guarded(controller, user, handler, req = {}) {
  const r = res();
  const request = as(user, req);
  let passed = false;
  await controller.requireAdmin(request, r, () => { passed = true; });
  if (!passed) return r;
  await controller[handler](request, r);
  return r;
}

test("non-admins get 403 on every notice route, even with vehicle permissions", async () => {
  const { controller } = setup();
  for (const handler of ["list", "unreadCount", "create", "read", "readAll", "archive", "runVehicleCheck"]) {
    const r = await guarded(controller, GUIDE, handler);
    assert.equal(r.statusCode, 403, handler);
  }
});

test("an admin posts a manual notice and it is unread for others", async () => {
  const { controller } = setup();
  const created = await guarded(controller, ADMIN, "create", { body: { title: "اجتماع", body: "غدًا 10:00", severity: "important" } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.notice.category, "manual");
  const list = await guarded(controller, ADMIN, "list");
  assert.equal(list.body.notices.length, 1);
  assert.equal(list.body.notices[0].read, true); // the author has read their own notice
});

test("manual notice validation", async () => {
  const { controller } = setup();
  const bad = await guarded(controller, ADMIN, "create", { body: { title: "", body: "x".repeat(2001), severity: "loud" } });
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
  const { service, controller } = setup();
  const { notice } = await service.publishNotice({ title: "t", body: "b", category: "system", severity: "info" });
  assert.equal((await guarded(controller, ADMIN, "unreadCount")).body.count, 1);
  await guarded(controller, ADMIN, "read", { params: { id: notice._id } });
  assert.equal((await guarded(controller, ADMIN, "unreadCount")).body.count, 0);
  await guarded(controller, ADMIN, "archive", { params: { id: notice._id } });
  assert.equal((await guarded(controller, ADMIN, "list")).body.notices.length, 0);
});

test("listAdmins returns admins with a valid email only", async () => {
  const { service } = setup();
  const admins = await service.listAdmins();
  // JSON round-trip: arrays from the vm context have a different prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(admins.map((a) => a.email))), ["admin@example.com"]);
});
