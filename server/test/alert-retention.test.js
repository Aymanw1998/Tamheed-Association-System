// How long an alert stays (owner, 2026-11-02): a read alert is deleted 30
// days after it was read; an unread one stays 180 days, except a parent's
// registration request, which stays until somebody opens it, and vehicle
// licence/test/insurance alerts, which stay until the document is renewed
// (read or not). Records that are deleted take their alerts with them.
const assert = require("node:assert/strict");
const test = require("node:test");

const retention = require("../services/alertRetention");

const DAY = 24 * 60 * 60 * 1000;
const AT = new Date("2026-11-02T10:00:00Z");

test("an ordinary unread alert expires 180 days after it was raised", () => {
  assert.deepEqual(retention.expiryOnRaise("lesson_no_attendance", AT), new Date(AT.getTime() + 180 * DAY));
});

test("a parent's request and vehicle alerts never expire while unread", () => {
  for (const type of ["parent_registration", "vehicle_license", "vehicle_test", "vehicle_insurance"]) {
    assert.equal(retention.expiryOnRaise(type, AT), null, type);
  }
});

test("a read alert expires 30 days after it was read", () => {
  assert.deepEqual(retention.expiryOnRead("absence_streak", AT), new Date(AT.getTime() + 30 * DAY));
  assert.deepEqual(retention.expiryOnRead("parent_registration", AT), new Date(AT.getTime() + 30 * DAY));
});

test("a read vehicle alert stays until the renewal removes it", () => {
  for (const type of ["vehicle_license", "vehicle_test", "vehicle_insurance"]) {
    assert.equal(retention.expiryOnRead(type, AT), null, type);
  }
});

test("dedup prefixes of the alerts that belong to a record", () => {
  const id = "a".repeat(24);
  assert.deepEqual(retention.recordPrefixes("vehicle", id), [`vehicle:${id}:`]);
  assert.deepEqual(retention.recordPrefixes("student", id), [`absence_streak:${id}:`, `parent_registration:${id}`]);
  assert.deepEqual(retention.recordPrefixes("lesson", id), [`lesson_no_attendance:${id}:`]);
  assert.deepEqual(retention.recordPrefixes("user", "123"), [
    "user_waiting:123:", "account_locked:123:", "access_changed:role:123:", "access_changed:permissions:123:",
  ]);
  assert.deepEqual(retention.recordPrefixes("student", ""), []);
  assert.deepEqual(retention.recordPrefixes("unknown", id), []);
});

test("a prefix becomes an anchored, escaped pattern", () => {
  const re = new RegExp(retention.prefixPattern("vehicle:a.b:"));
  assert.ok(re.test("vehicle:a.b:license"));
  assert.ok(!re.test("vehicle:aXb:license"));
  assert.ok(!re.test("x-vehicle:a.b:license"));
});
