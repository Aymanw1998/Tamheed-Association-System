// Who hears about a new request, and IT hearing about a new administrator.
const assert = require("node:assert/strict");
const test = require("node:test");
const { createAlertEvents } = require("../services/alertEvents");
const { createAlertEngine } = require("../services/alertEngine");
const { canSeeAlertType } = require("../services/alertAccess");
const { effectivePermissions, can } = require("../utils/permissions");

const ADMIN = "ادارة";
const admin = (tz, extra = {}) => ({ _id: `id-${tz}`, tz, firstname: "A", lastname: tz, role: ADMIN, roles: [ADMIN], ...extra });

function eventsFor(users) {
  const raised = [];
  const real = createAlertEngine({
    listActiveUsers: async () => users,
    findStudentById: async () => null,
    lessonsWithStudent: async () => [],
    store: {},
    systemTz: "000000026",
    log() {},
  });
  const engine = { recipientsFor: real.recipientsFor, raise: async (row) => { raised.push(row); return { created: row.recipients }; } };
  return { events: createAlertEvents({ engine, now: () => new Date("2026-11-04T10:00:00Z") }), raised };
}

test("a new request goes only to the marked users who may approve", async () => {
  const { events, raised } = eventsFor([admin("1", { receivesRequestAlerts: true }), admin("2")]);
  await events.userWaiting({ tz: "9", firstname: "N" });
  assert.deepEqual(raised[0].recipients, ["1"]);
});

test("with nobody marked, every holder of users.approve hears", async () => {
  const { events, raised } = eventsFor([admin("1"), admin("2"), { _id: "g", tz: "3", role: "مرشد", roles: ["مرشد"] }]);
  await events.userWaiting({ tz: "9", firstname: "N" });
  assert.deepEqual(raised[0].recipients.sort(), ["1", "2"]);
});

test("a marked user who may not approve does not count as marked", async () => {
  const { events, raised } = eventsFor([admin("1"), { _id: "g", tz: "3", role: "مرشد", roles: ["مرشد"], receivesRequestAlerts: true }]);
  await events.userWaiting({ tz: "9", firstname: "N" });
  assert.deepEqual(raised[0].recipients, ["1"]);
});

test("being marked gives no right to approve", () => {
  const set = effectivePermissions({ tz: "3", role: "مرشد", roles: ["مرشد"], receivesRequestAlerts: true });
  assert.equal(can(set, "users.approve"), false);
});

test("a new administrator alerts IT only", async () => {
  const { events, raised } = eventsFor([admin("1"), { _id: "t", tz: "4", isIT: true }]);
  await events.adminAdded({ tz: "9", firstname: "N" });
  assert.equal(raised[0].type, "admin_added");
  assert.deepEqual(raised[0].recipients, ["4"]);
});

test("admin_added is readable by IT, not by an everyday user", () => {
  assert.equal(canSeeAlertType({ user: { isIT: true } }, "admin_added"), true);
  assert.equal(canSeeAlertType({ user: { role: ADMIN }, permissions: new Set() }, "admin_added"), false);
});
