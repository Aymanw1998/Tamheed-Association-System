// A deleted record takes its alerts with it (owner, 2026-11-02), and a
// vehicle's alerts stay until the document is renewed: only the current stage
// of each licence/test/insurance is kept, in the inbox and on the board.
const assert = require("node:assert/strict");
const test = require("node:test");

const { createRecordAlerts } = require("../services/recordAlerts");
const { dedupKeyFor } = require("../utils/vehicleNotices");
const rules = require("../utils/vehicleRules");

const TODAY = "2026-11-02";
const VID = "v".repeat(24);

function fakeStore() {
  const calls = [];
  return {
    calls,
    async removeByPrefixes(prefixes) { calls.push(["prefixes", prefixes]); return prefixes.length; },
    async removeExcept(prefix, keep) { calls.push(["except", prefix, [...keep].sort()]); return 0; },
    async removeForRecipient(tz) { calls.push(["recipient", tz]); return 1; },
  };
}

const setup = () => {
  const alerts = fakeStore();
  const notices = fakeStore();
  return { alerts, notices, records: createRecordAlerts({ alerts, notices, today: () => TODAY }) };
};

test("a deleted vehicle's alerts and board notices go", async () => {
  const { alerts, notices, records } = setup();
  await records.forget("vehicle", VID);
  assert.deepEqual(alerts.calls, [["prefixes", [`vehicle:${VID}:`]]]);
  assert.deepEqual(notices.calls, [["prefixes", [`vehicle:${VID}:`]]]);
});

test("a deleted student's and lesson's alerts go; the board is not touched", async () => {
  const { alerts, notices, records } = setup();
  await records.forget("student", "s1");
  await records.forget("lesson", "l1");
  assert.deepEqual(alerts.calls, [
    ["prefixes", ["absence_streak:s1:", "parent_registration:s1"]],
    ["prefixes", ["lesson_no_attendance:l1:"]],
  ]);
  assert.deepEqual(notices.calls, []);
});

test("a deleted user's alerts about them and their own inbox go", async () => {
  const { alerts, records } = setup();
  await records.forget("user", "123456782");
  assert.deepEqual(alerts.calls, [
    ["prefixes", ["user_waiting:123456782:", "account_locked:123456782:", "access_changed:role:123456782:", "access_changed:permissions:123456782:"]],
    ["recipient", "123456782"],
  ]);
});

const vehicle = (extra = {}) => ({
  _id: VID, plate: "1234567", status: "active",
  licenses: [{ id: "l1", validUntil: "2026-11-20" }], // 18 days left
  nextTestDate: "2028-01-01",
  policies: [{ id: "p1", type: "mandatory", startDate: "2026-01-01", endDate: "2027-06-01" }],
  ...extra,
});

test("a saved vehicle keeps only the alerts of its current stages", async () => {
  const { alerts, notices, records } = setup();
  const current = rules.buildAlerts(vehicle(), TODAY).map(dedupKeyFor).sort();
  assert.ok(current.some((key) => key.startsWith(`vehicle:${VID}:license:`)), "the licence is due");
  await records.syncVehicle(vehicle());
  assert.deepEqual(alerts.calls, [["except", `vehicle:${VID}:`, current]]);
  assert.deepEqual(notices.calls, [["except", `vehicle:${VID}:`, current]]);
});

test("a renewal leaves no alert about that document", async () => {
  const { alerts, records } = setup();
  await records.syncVehicle(vehicle({ licenses: [{ id: "l2", validUntil: "2027-11-20" }] }));
  const kept = alerts.calls[0][2];
  assert.ok(!kept.some((key) => key.includes(":license:")));
});

test("an archived vehicle keeps no alert", async () => {
  const { alerts, records } = setup();
  await records.syncVehicle(vehicle({ status: "archived" }));
  assert.deepEqual(alerts.calls, [["except", `vehicle:${VID}:`, []]]);
});

test("nothing happens without an id", async () => {
  const { alerts, notices, records } = setup();
  await records.forget("vehicle", "");
  await records.syncVehicle({});
  assert.deepEqual(alerts.calls, []);
  assert.deepEqual(notices.calls, []);
});

test("the nightly check keeps only the current keys of every vehicle", async () => {
  const { alerts, notices, records } = setup();
  await records.pruneVehicles(new Set(["vehicle:a:test:due7:2026-11-09"]));
  assert.deepEqual(alerts.calls, [["except", "vehicle:", ["vehicle:a:test:due7:2026-11-09"]]]);
  assert.deepEqual(notices.calls, [["except", "vehicle:", ["vehicle:a:test:due7:2026-11-09"]]]);
});
