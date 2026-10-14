const assert = require("node:assert/strict");
const test = require("node:test");
const notices = require("../utils/vehicleNotices");

const alert = (extra = {}) => ({
  vehicleId: "v1", plate: "1234567", nickname: "باص", kind: "insurance",
  level: "due30", dueDate: "2026-11-13", daysLeft: 30, ...extra,
});

test("severity follows the agreed table", () => {
  assert.equal(notices.noticeSeverity("due60"), "info");
  for (const level of ["due30", "due14", "missing"]) assert.equal(notices.noticeSeverity(level), "important");
  for (const level of ["due7", "due0", "expired"]) assert.equal(notices.noticeSeverity(level), "critical");
});

test("each stage is announced once", () => {
  const first = notices.planVehicleNotices([alert()], new Set());
  assert.equal(first.length, 1);
  const again = notices.planVehicleNotices([alert()], new Set([first[0].dedupKey]));
  assert.equal(again.length, 0);
});

test("an expired document repeats once a week", () => {
  const day = (daysLeft) => alert({ level: "expired", dueDate: "2026-09-30", daysLeft });
  const k1 = notices.dedupKeyFor(day(-1));
  assert.equal(notices.dedupKeyFor(day(-6)), k1);
  assert.notEqual(notices.dedupKeyFor(day(-7)), k1);
  assert.equal(notices.dedupKeyFor(day(-7)), notices.dedupKeyFor(day(-13)));
});

test("renewal changes the key so old reminders stop", () => {
  assert.notEqual(notices.dedupKeyFor(alert()), notices.dedupKeyFor(alert({ dueDate: "2027-11-13" })));
});

test("notices link to the vehicle and sort critical first", () => {
  const planned = notices.planVehicleNotices(
    [alert({ level: "due60", daysLeft: 60 }), alert({ kind: "license", level: "expired", dueDate: "2026-10-01", daysLeft: -13 })],
    new Set()
  );
  assert.deepEqual(planned.map((n) => n.severity), ["critical", "info"]);
  assert.equal(planned[0].link, "/vehicles/v1");
  assert.equal(planned[0].category, "vehicle");
  assert.match(planned[0].title, /1234567/);
});

test("titles differ per stage", () => {
  const a = notices.noticeFromAlert(alert({ level: "due60", daysLeft: 60 }));
  const b = notices.noticeFromAlert(alert({ level: "due30", daysLeft: 30 }));
  assert.notEqual(a.title, b.title);
  assert.match(a.title, /خلال 60 يومًا/);
});

test("digest lists every notice and escapes HTML", () => {
  const planned = notices.planVehicleNotices([alert({ nickname: "<b>x</b>" })], new Set());
  const digest = notices.buildDigest(planned);
  assert.match(digest.subject, /1/);
  assert.ok(!digest.html.includes("<b>x</b>"));
  assert.ok(digest.text.includes("1234567"));
});
