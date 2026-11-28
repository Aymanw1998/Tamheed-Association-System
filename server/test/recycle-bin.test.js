// The recycle bin (owner, 2026-11-16): deleted students, vehicles and staff
// are kept 30 days, can be restored or deleted for good, and each kind needs
// its own delete key.
const assert = require("node:assert/strict");
const test = require("node:test");

const { createRecycleBin, KEEP_DAYS } = require("../services/recycleBin");
const { createTrashController } = require("../Entities/Trash/Trash.controller");
const { auditStub } = require("./helpers/auditStub");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-16T10:00:00Z");

function memoryModel() {
  let rows = [];
  let next = 1;
  const matches = (row, filter) => Object.entries(filter).every(([key, want]) => {
    if (want && typeof want === "object" && "$in" in want) return want.$in.includes(row[key]);
    if (want && typeof want === "object" && "$lt" in want) return new Date(row[key]) < want.$lt;
    return String(row[key]) === String(want);
  });
  return {
    async create(data) { const row = { _id: `t${next++}`, ...data }; rows.push(row); return { success: true, result: row }; },
    async get(filter) { return { success: true, result: rows.filter((row) => matches(row, filter)) }; },
    async delete(filter) { const before = rows.length; rows = rows.filter((row) => !matches(row, filter)); return { success: true, result: { deletedCount: before - rows.length } }; },
    all: () => rows,
  };
}

function fakeHooks() {
  const calls = [];
  const hook = (kind) => ({
    async restore(entry) { calls.push(["restore", kind, entry.refId]); return entry.data?.blocked ? { ok: false, status: 409, message: "taken" } : { ok: true }; },
    async purge(entry) { calls.push(["purge", kind, entry.refId]); return { failed: entry.data?.filesFail ? 1 : 0 }; },
  });
  return { calls, hooks: { student: hook("student"), vehicle: hook("vehicle"), user: { ...hook("user"), visible: (entry) => !entry.data?.hidden } } };
}

const makeRes = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const actor = (...keys) => ({ actor: { tz: "111111118", name: "Ad Min", permissions: new Set(keys) } });

test("put keeps the record with who deleted it; drop takes it back out", async () => {
  const model = memoryModel();
  const bin = createRecycleBin({ model, hooks: {}, now: () => NOW });
  const id = await bin.put("student", { refId: "s1", label: "Example Student", data: { _id: "s1", tz: "1" }, actor: { tz: "9", name: "Ad" } });
  assert.equal(id, "t1");
  const [row] = model.all();
  assert.equal(row.kind, "student");
  assert.equal(row.deletedBy.name, "Ad");
  assert.equal(bin.expiresAt(row).getTime(), NOW.getTime() + KEEP_DAYS * DAY);
  await bin.drop(id);
  assert.equal(model.all().length, 0);
  await assert.rejects(bin.put("lesson", { refId: "x" }), /unknown/);
});

test("the daily job deletes for good only what is older than 30 days, and keeps a row whose files fail", async () => {
  const model = memoryModel();
  const { calls, hooks } = fakeHooks();
  let now = new Date(NOW.getTime() - 40 * DAY);
  const bin = createRecycleBin({ model, hooks, now: () => now });
  await bin.put("student", { refId: "old", data: {} });
  await bin.put("vehicle", { refId: "old-files", data: { filesFail: true } });
  now = new Date(NOW.getTime() - 5 * DAY);
  await bin.put("user", { refId: "recent", data: {} });
  now = NOW;
  assert.equal(await bin.purgeExpired(), 1);
  assert.deepEqual(model.all().map((row) => row.refId).sort(), ["old-files", "recent"]);
  assert.deepEqual(calls.map((c) => c.slice(0, 2)).sort(), [["purge", "student"], ["purge", "vehicle"]]);
});

test("the list shows only the kinds whose delete key the actor holds, and hidden users never", async () => {
  const model = memoryModel();
  const { hooks } = fakeHooks();
  const bin = createRecycleBin({ model, hooks, now: () => NOW });
  await bin.put("student", { refId: "s1", label: "Student", data: {} });
  await bin.put("vehicle", { refId: "v1", label: "1234567", data: {} });
  await bin.put("user", { refId: "u1", label: "Staff", data: {} });
  await bin.put("user", { refId: "u2", label: "System", data: { hidden: true } });
  const controller = createTrashController({ bin, hooks, audit: auditStub().deps["../../utils/audit"].audit });

  const res = makeRes();
  await controller.list(actor("students.delete", "users.delete"), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.items.map((i) => i.label).sort(), ["Staff", "Student"]);
  assert.ok(res.body.items[0].expiresAt);
  assert.ok(!("data" in res.body.items[0]), "the record itself is not sent");
});

test("restore and purge need the kind's key; each is written to the audit log", async () => {
  const model = memoryModel();
  const { calls, hooks } = fakeHooks();
  const bin = createRecycleBin({ model, hooks, now: () => NOW });
  const audit = auditStub();
  const controller = createTrashController({ bin, hooks, audit: audit.deps["../../utils/audit"].audit });
  const vehicleId = await bin.put("vehicle", { refId: "v1", label: "1234567", data: {} });
  const studentId = await bin.put("student", { refId: "s1", label: "Student", data: {} });

  const refused = makeRes();
  await controller.restore({ ...actor("students.delete"), params: { id: vehicleId } }, refused);
  assert.equal(refused.statusCode, 404);
  assert.equal(calls.length, 0);

  const restored = makeRes();
  await controller.restore({ ...actor("vehicles.delete"), params: { id: vehicleId } }, restored);
  assert.equal(restored.statusCode, 200);
  assert.deepEqual(audit.find({ module: "vehicles", action: "restore", targetId: "v1" }).length, 1);

  const noPurgeKey = makeRes();
  await controller.purge({ ...actor("students.delete"), params: { id: studentId } }, noPurgeKey);
  assert.equal(noPurgeKey.statusCode, 403);
  assert.equal(model.all().length, 1);

  const purged = makeRes();
  await controller.purge({ ...actor("students.delete", "students.purge"), params: { id: studentId } }, purged);
  assert.equal(purged.statusCode, 200);
  assert.equal(audit.find({ module: "students", action: "purge", targetId: "s1" }).length, 1);
  assert.equal(model.all().length, 0);

  const missing = makeRes();
  await controller.purge({ ...actor("students.delete"), params: { id: "nope" } }, missing);
  assert.equal(missing.statusCode, 404);
});

test("a refused restore keeps the row and says why; failed files keep it too", async () => {
  const model = memoryModel();
  const { hooks } = fakeHooks();
  const bin = createRecycleBin({ model, hooks, now: () => NOW });
  const controller = createTrashController({ bin, hooks, audit: auditStub().deps["../../utils/audit"].audit });
  const blocked = await bin.put("student", { refId: "s1", data: { blocked: true } });
  const files = await bin.put("vehicle", { refId: "v1", data: { filesFail: true } });

  const res = makeRes();
  await controller.restore({ ...actor("students.delete"), params: { id: blocked } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "taken");

  const purge = makeRes();
  await controller.purge({ ...actor("vehicles.delete", "vehicles.purge"), params: { id: files } }, purge);
  assert.equal(purge.statusCode, 502);
  assert.equal(model.all().length, 2);
});

test("each row says whether this actor may delete it for good (owner, 2026-11-18)", async () => {
  const model = memoryModel();
  const { hooks } = fakeHooks();
  const bin = createRecycleBin({ model, hooks, now: () => NOW });
  await bin.put("student", { refId: "s1", label: "Student", data: {} });
  await bin.put("vehicle", { refId: "v1", label: "Car", data: {} });
  const controller = createTrashController({ bin, hooks, audit: auditStub().deps["../../utils/audit"].audit });
  const res = makeRes();
  await controller.list(actor("students.delete", "vehicles.delete", "vehicles.purge"), res);
  assert.deepEqual(res.body.items.map((i) => [i.label, i.canPurge]).sort(), [["Car", true], ["Student", false]]);
});

// Codex review, 2026-11-18: a guide with students.delete only sees students
// in their own scope, like deleting itself.
test("a student row outside the actor's students can be neither seen, restored nor deleted for good", async () => {
  const model = memoryModel();
  const { calls, hooks } = fakeHooks();
  hooks.student.visible = async (entry, req) => entry.data.guide === req.actor.id;
  const bin = createRecycleBin({ model, hooks, now: () => NOW });
  await bin.put("student", { refId: "mine", label: "Mine", data: { guide: "g1" } });
  const other = await bin.put("student", { refId: "other", label: "Other", data: { guide: "g2" } });
  const controller = createTrashController({ bin, hooks, audit: auditStub().deps["../../utils/audit"].audit });
  const guide = (...keys) => ({ actor: { id: "g1", tz: "1", permissions: new Set(keys) } });

  const list = makeRes();
  await controller.list(guide("students.delete"), list);
  assert.deepEqual(list.body.items.map((i) => i.label), ["Mine"]);
  for (const action of ["restore", "purge"]) {
    const res = makeRes();
    await controller[action]({ ...guide("students.delete", "students.purge"), params: { id: other } }, res);
    assert.equal(res.statusCode, 404, action);
  }
  assert.equal(calls.length, 0);
});

/* ---------- owner, 2026-11-27: nasheeds in the bin ---------- */
test("a nasheed goes to the bin and is listed and restored only for a nasheeds.manage holder", async () => {
  const model = memoryModel();
  const calls = [];
  const hooks = { nasheed: { async restore(entry) { calls.push(entry.refId); return { ok: true }; }, async purge() { return { failed: 0 }; } } };
  const bin = createRecycleBin({ model, hooks, now: () => NOW });
  const id = await bin.put("nasheed", { refId: "n1", label: "أوقدت", data: { _id: "n1" } });
  const audit = auditStub();
  const controller = createTrashController({ bin, hooks, audit: audit.deps["../../utils/audit"].audit });

  const hidden = makeRes();
  await controller.list(actor("students.delete"), hidden);
  assert.deepEqual(hidden.body.items, []);
  const refused = makeRes();
  await controller.restore({ ...actor("students.delete"), params: { id } }, refused);
  assert.equal(refused.statusCode, 404);

  const shown = makeRes();
  await controller.list(actor("nasheeds.manage"), shown);
  assert.deepEqual(shown.body.items.map((i) => i.label), ["أوقدت"]);
  const restored = makeRes();
  await controller.restore({ ...actor("nasheeds.manage"), params: { id } }, restored);
  assert.equal(restored.statusCode, 200);
  assert.deepEqual(calls, ["n1"]);
  assert.equal(audit.find({ module: "nasheeds", action: "restore" }).length, 1);
});
