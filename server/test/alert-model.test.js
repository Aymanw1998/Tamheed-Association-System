// The AiAlerts model against a fake api.js (no database): every row gets the
// date it is deleted on (services/alertRetention), reading moves it, and the
// alerts of a deleted record or a renewed document can be removed.
const assert = require("node:assert/strict");
const test = require("node:test");

const DAY = 24 * 60 * 60 * 1000;
const AT = new Date("2026-11-02T10:00:00Z");

function loadModel() {
  const calls = [];
  const rows = [];
  const fakeApi = {
    calls, rows,
    async read({ filter }) {
      calls.push(["read", filter]);
      return { result: rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)) };
    },
    async create({ data }) { calls.push(["create", data]); rows.push(data); return { result: data }; },
    async updateExisting({ filter, newData }) {
      calls.push(["updateExisting", filter, newData]);
      const hit = rows.find((r) => r._id === filter._id && r.recipientTz === filter.recipientTz && r.readAt == null);
      if (!hit) return { result: null };
      Object.assign(hit, newData);
      return { result: hit };
    },
    async updateMany({ filter, newData }) { calls.push(["updateMany", filter, newData]); return { result: { modifiedCount: 2 } }; },
    async delete({ filter }) { calls.push(["delete", filter]); return { result: { deletedCount: 3 } }; },
  };
  const apiPath = require.resolve("../Entities/api");
  const modelPath = require.resolve("../Entities/Alert/Alert.model");
  const saved = require.cache[apiPath];
  require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: fakeApi };
  delete require.cache[modelPath];
  try {
    return { ...require("../Entities/Alert/Alert.model"), api: fakeApi };
  } finally {
    if (saved) require.cache[apiPath] = saved; else delete require.cache[apiPath];
    delete require.cache[modelPath];
  }
}

test("a new row carries its deletion date: 180 days, or none for a parent's request", async () => {
  const { AlertModelDef, api } = loadModel();
  await AlertModelDef.insertOnce({ recipientTz: "t1", type: "absence_streak", dedupKey: "k1", readAt: null, at: AT });
  await AlertModelDef.insertOnce({ recipientTz: "t1", type: "parent_registration", dedupKey: "k2", readAt: null, at: AT });
  const created = api.calls.filter(([op]) => op === "create").map(([, data]) => data);
  assert.deepEqual(created[0].expireAt, new Date(AT.getTime() + 180 * DAY));
  assert.equal(created[1].expireAt, null);
});

test("reading a row moves its deletion to 30 days later; a vehicle row stays", async () => {
  const { AlertModelDef, api } = loadModel();
  api.rows.push({ _id: "1".repeat(24), recipientTz: "t1", type: "parent_registration", readAt: null, expireAt: null });
  api.rows.push({ _id: "2".repeat(24), recipientTz: "t1", type: "vehicle_test", readAt: null, expireAt: null });
  await AlertModelDef.markRead("t1", "1".repeat(24), AT);
  await AlertModelDef.markRead("t1", "2".repeat(24), AT);
  assert.deepEqual(api.rows[0].readAt, AT);
  assert.deepEqual(api.rows[0].expireAt, new Date(AT.getTime() + 30 * DAY));
  assert.deepEqual(api.rows[1].readAt, AT);
  assert.equal(api.rows[1].expireAt, null);
});

test("someone else's row is not read and not found", async () => {
  const { AlertModelDef, api } = loadModel();
  api.rows.push({ _id: "1".repeat(24), recipientTz: "t2", type: "absence_streak", readAt: null });
  assert.equal(await AlertModelDef.markRead("t1", "1".repeat(24), AT), null);
  assert.equal(api.rows[0].readAt, null);
});

test("read all: 30 days for ordinary rows, no limit for vehicle rows", async () => {
  const { AlertModelDef, api } = loadModel();
  const updated = await AlertModelDef.markAllRead("t1", AT);
  const updates = api.calls.filter(([op]) => op === "updateMany");
  assert.equal(updates.length, 2);
  const vehicle = ["vehicle_license", "vehicle_test", "vehicle_insurance"];
  assert.deepEqual(updates[0][1], { recipientTz: "t1", readAt: null, type: { $nin: vehicle } });
  assert.deepEqual(updates[0][2], { readAt: AT, expireAt: new Date(AT.getTime() + 30 * DAY) });
  assert.deepEqual(updates[1][1], { recipientTz: "t1", readAt: null, type: { $in: vehicle } });
  assert.deepEqual(updates[1][2], { readAt: AT });
  assert.equal(updated, 4);
});

test("removing by dedup prefix deletes every recipient's rows", async () => {
  const { AlertModelDef, api } = loadModel();
  assert.equal(await AlertModelDef.removeByPrefixes(["vehicle:v1:", "x.y:"]), 3);
  assert.deepEqual(api.calls.at(-1), ["delete", { $or: [{ dedupKey: { $regex: "^vehicle:v1:" } }, { dedupKey: { $regex: "^x\\.y:" } }] }]);
  assert.equal(await AlertModelDef.removeByPrefixes([]), 0);
  assert.equal(api.calls.length, 1);
});

test("removing all but the current keys under a prefix", async () => {
  const { AlertModelDef, api } = loadModel();
  await AlertModelDef.removeExcept("vehicle:", ["vehicle:v1:test:due7:2026-11-09"]);
  assert.deepEqual(api.calls.at(-1), ["delete", { dedupKey: { $regex: "^vehicle:", $nin: ["vehicle:v1:test:due7:2026-11-09"] } }]);
});

test("removing a recipient's whole inbox", async () => {
  const { AlertModelDef, api } = loadModel();
  await AlertModelDef.removeForRecipient("t9");
  assert.deepEqual(api.calls.at(-1), ["delete", { recipientTz: "t9" }]);
  await AlertModelDef.removeForRecipient("  ");
  assert.equal(api.calls.length, 1);
});

test("the TTL index is on expireAt, and the old one on `at` is dropped once", async () => {
  const { ALERT_INDEXES, ensureAlertIndexes } = loadModel();
  assert.deepEqual(JSON.parse(JSON.stringify(ALERT_INDEXES.find((i) => i.options?.expireAfterSeconds !== undefined))),
    { key: { expireAt: 1 }, options: { expireAfterSeconds: 0 } });
  const ops = [];
  const collection = {
    async indexes() { return [{ name: "_id_" }, { name: "at_1", key: { at: 1 }, expireAfterSeconds: 15552000 }]; },
    async dropIndex(name) { ops.push(["drop", name]); },
    async createIndex(key, options) { ops.push(["create", key, options]); },
    async updateMany(filter, update) { ops.push(["backfill", filter, update]); },
  };
  await ensureAlertIndexes(collection);
  assert.deepEqual(ops[0], ["drop", "at_1"]);
  assert.ok(ops.some(([op, key]) => op === "create" && key.expireAt === 1));
  // Rows from before: read ones 30 days after reading, unread ordinary ones
  // 180 days after raising; parents' requests and vehicle rows untouched.
  const backfills = ops.filter(([op]) => op === "backfill");
  assert.equal(backfills.length, 2);
  assert.deepEqual(backfills[0][1], { expireAt: { $exists: false }, readAt: { $ne: null }, type: { $nin: ["vehicle_license", "vehicle_test", "vehicle_insurance"] } });
  assert.deepEqual(backfills[1][1], { expireAt: { $exists: false }, readAt: null, type: { $nin: ["parent_registration", "vehicle_license", "vehicle_test", "vehicle_insurance"] } });
});

test("no old index: nothing is dropped", async () => {
  const { ensureAlertIndexes } = loadModel();
  const ops = [];
  await ensureAlertIndexes({
    async indexes() { return [{ name: "_id_" }]; },
    async dropIndex(name) { ops.push(name); },
    async createIndex() {},
    async updateMany() {},
  });
  assert.deepEqual(ops, []);
});
