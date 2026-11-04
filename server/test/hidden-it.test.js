// An IT user with no everyday role works in System unseen, as «النظام»; the
// IT site's audit log keeps the real person (owner, 2026-11-04).
const assert = require("node:assert/strict");
const test = require("node:test");
const pm = require("../middleware/permissionMiddleware");
const { isHiddenIt, isHiddenUser, actorRef, actorDisplayName, can } = require("../utils/permissions");
const { validatePermissionChange, grantableBy, isAdminWithPowers } = require("../utils/permissionRules");
const { canSeeAlertType } = require("../services/alertAccess");
const { createAudit } = require("../utils/audit");

const SYSTEM_TZ = "000000026";
process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
const HIDDEN = { _id: "h1", tz: "100000009", firstname: "Real", lastname: "Person", isIT: true };

async function actorOf(user) {
  const load = pm.createLoadActor({ findActiveUserByTz: async () => user, systemTz: SYSTEM_TZ });
  const req = { user: { tz: user.tz, strong: true } };
  const out = { statusCode: 0, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } };
  await load(req, out, () => {});
  return { actor: req.actor, out };
}

test("who is hidden: IT, not blocked, no role, not 000000000", () => {
  assert.equal(isHiddenIt(HIDDEN), true);
  assert.equal(isHiddenIt({ ...HIDDEN, role: "مرشد", roles: ["مرشد"] }), false);
  assert.equal(isHiddenIt({ ...HIDDEN, itBlockedAt: new Date() }), false);
  assert.equal(isHiddenIt({ ...HIDDEN, isIT: false }), false);
  assert.equal(isHiddenIt({ ...HIDDEN, tz: SYSTEM_TZ }), false);
  assert.equal(isHiddenUser({ tz: SYSTEM_TZ }), true);
  assert.equal(isHiddenUser(HIDDEN), true);
  assert.equal(isHiddenUser({ tz: "5", role: "مرشد" }), false);
});

test("in System a hidden IT user holds every everyday key, no IT key, and acts as the system", async () => {
  const { actor } = await actorOf(HIDDEN);
  assert.equal(actor.isSystem, true);
  assert.equal(actor.hidden, true);
  assert.equal(can(actor, "students.edit"), true);
  assert.equal(can(actor, "sports.manage"), true);
  assert.equal(can(actor, "audit.view"), false);
  assert.equal(actorRef(actor, "x"), "system");
  assert.equal(actorDisplayName(actor), "النظام");
});

test("given a role, the same person acts under their own name on the next request", async () => {
  const { actor } = await actorOf({ ...HIDDEN, role: "مرشد", roles: ["مرشد"] });
  assert.equal(actor.isSystem, false);
  assert.notEqual(actor.hidden, true);
  assert.equal(actorDisplayName(actor), "Real Person");
});

test("000000000 is not marked hidden, and a blocked IT user with no role holds nothing", async () => {
  const { actor: sys } = await actorOf({ _id: "s", tz: SYSTEM_TZ, isIT: true });
  assert.equal(sys.isSystem, true);
  assert.notEqual(sys.hidden, true);
  const { actor: blocked } = await actorOf({ ...HIDDEN, itBlockedAt: new Date() });
  assert.equal(blocked.isSystem, false);
  assert.equal(blocked.permissions.size, 0);
});

test("a locked hidden IT user is refused; the lock is not skipped as for 000000000", async () => {
  const { actor, out } = await actorOf({ ...HIDDEN, lockedAt: new Date() });
  assert.equal(actor, undefined);
  assert.equal(out.statusCode, 423);
});

test("system_login_failures stays with 000000000", async () => {
  const { actor } = await actorOf(HIDDEN);
  assert.equal(canSeeAlertType(actor, "system_login_failures"), false);
  assert.equal(canSeeAlertType({ isSystem: true }, "system_login_failures"), true);
});

test("a hidden IT user changes permissions in System whatever the switch, never an IT key or an IT user", async () => {
  const { actor } = await actorOf(HIDDEN);
  const guide = { _id: "g", tz: "g1", role: "مرشد", roles: ["مرشد"] };
  assert.equal(validatePermissionChange(actor, guide, { grants: ["finance.view"] }).ok, true);
  assert.equal(validatePermissionChange(actor, { _id: "a", tz: "a1", role: "ادارة", roles: ["ادارة"] }, { grants: ["ai.use"] }).ok, true);
  assert.equal(validatePermissionChange(actor, guide, { grants: ["audit.view"] }).code, "NOT_GRANTABLE");
  assert.equal(validatePermissionChange(actor, { ...guide, isIT: true }, { grants: [] }).code, "FORBIDDEN");
  assert.ok(!grantableBy(actor).has("permissions.manage"));
  assert.equal(isAdminWithPowers(actor), false);
  const gate = (a) => { let passed = false; pm.adminPowersGate({ actor: a }, { status() { return this; }, json() {} }, () => { passed = true; }); return passed; };
  assert.equal(gate(actor), true);
  assert.equal(gate({ isSystem: true, tz: SYSTEM_TZ }), false);
});

test("the audit row reads «النظام» and keeps the real person apart", async () => {
  const rows = [];
  const audit = createAudit({ model: { create: async (r) => rows.push(r) } });
  const { actor } = await actorOf(HIDDEN);
  await audit.record({ actor }, { module: "students", action: "create", targetType: "student", targetId: "1" });
  assert.equal(rows[0].actor, "system");
  assert.equal(rows[0].actorName, "النظام");
  assert.equal(rows[0].realActor, HIDDEN.tz);
  assert.equal(rows[0].realActorName, "Real Person");
});

test("an ordinary actor and 000000000 store no real-person fields", async () => {
  const rows = [];
  const audit = createAudit({ model: { create: async (r) => rows.push(r) } });
  await audit.record({ actor: { tz: "5", name: "N" } }, { module: "m", action: "a" });
  await audit.record({ actor: { tz: SYSTEM_TZ, isSystem: true } }, { module: "m", action: "a" });
  assert.equal("realActor" in rows[0], false);
  assert.equal("realActor" in rows[1], false);
});
