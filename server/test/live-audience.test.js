const assert = require("node:assert/strict");
const test = require("node:test");

const { mayReceive } = require("../services/liveAudience");
const { actorFor } = require("./helpers/actors");

const ADMIN = actorFor({ _id: "a".repeat(24), tz: "100000009", firstname: "Ad", lastname: "Min", roles: ["ادارة"] });
const GUIDE = actorFor({ _id: "b".repeat(24), tz: "200000008", firstname: "Gu", lastname: "Ide", roles: ["مرشد"] });
const COACH = actorFor({ _id: "c".repeat(24), tz: "300000007", firstname: "Co", lastname: "Ach", roles: ["مرشد"], permissionGrants: ["sports.coach"] });

test("an administrator receives every staff kind (sport needs its own grant)", () => {
  for (const [type, payload] of [
    ["change", { entity: "student", id: "s1" }], ["change", { entity: "user", id: "u1" }],
    ["change", { entity: "vehicle", id: "v1" }], ["lock", { key: "attendance:L1:2026-10-25" }],
    ["change", { entity: "report", id: "r1" }],
  ]) assert.equal(mayReceive(ADMIN, type, payload), true, JSON.stringify(payload));
  assert.equal(mayReceive(ADMIN, "lock", { key: "sportAttendance:L2:2026-10-25" }), false);
  assert.equal(mayReceive(ADMIN, "change", { entity: "sportLesson", id: "L2" }), true, "the lesson schedule shows sport lessons");
});

test("a scoped guide gets only his own students, his own user record and his own reports", () => {
  const visible = new Set(["s1"]);
  assert.equal(mayReceive(GUIDE, "change", { entity: "student", id: "s1" }, { visible }), true);
  assert.equal(mayReceive(GUIDE, "lock", { key: "student:s2" }, { visible }), false);
  assert.equal(mayReceive(GUIDE, "change", { entity: "user", id: GUIDE.id }), true, "his own record");
  assert.equal(mayReceive(GUIDE, "change", { entity: "user", id: ADMIN.id }), false);
  assert.equal(mayReceive(GUIDE, "change", { entity: "report", id: "r1" }, { audience: { owner: GUIDE.id } }), true);
  assert.equal(mayReceive(GUIDE, "change", { entity: "report", id: "r2" }, { audience: { owner: ADMIN.id } }), false);
  assert.equal(mayReceive(GUIDE, "lock", { key: "report:r2" }), false, "a report lock has no owner: viewAll only");
  assert.equal(mayReceive(GUIDE, "change", { entity: "vehicle", id: "v1" }), false);
});

test("sport events reach the sport staff; unknown kinds and types reach nobody", () => {
  assert.equal(mayReceive(COACH, "lock", { key: "sportAttendance:L2:2026-10-25" }), true);
  assert.equal(mayReceive(GUIDE, "change", { entity: "player", id: "s1" }), false);
  assert.equal(mayReceive(ADMIN, "change", { entity: "mystery", id: "x" }), false);
  assert.equal(mayReceive(ADMIN, "storage", { entity: "student", id: "s1" }), false);
  assert.equal(mayReceive(null, "change", { entity: "lesson", id: "L1" }), false);
});
