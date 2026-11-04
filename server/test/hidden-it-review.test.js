// What the review of the hidden-IT work found (2026-11-04).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.SYSTEM_ADMIN_TZ = "000000026";
const pm = require("../middleware/permissionMiddleware");
const { actorRef, actorDisplayName } = require("../utils/permissions");
const { canEditDetails } = require("../utils/permissionRules");
const { editorStamp, lockOwner, lockedMessage } = require("../middleware/lockGuard");
const { createSystemCode } = require("../Entities/User/SystemCode.auth");
const { challengeSecret } = require("../Entities/User/User.passkey");

const HIDDEN = { _id: "h1", tz: "100000009", firstname: "Real", lastname: "Person", isIT: true };
const SYS = { _id: "s", tz: "000000026", isIT: true };

async function loaded(user, claims = {}) {
  const load = pm.createLoadActor({ findActiveUserByTz: async () => user, systemTz: "000000026" });
  const req = { user: { tz: user.tz, ...claims } };
  const out = { statusCode: 0, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } };
  let passed = false;
  await load(req, out, () => { passed = true; });
  return { passed, out, req };
}

test("a hidden IT user's session from a password alone is refused", async () => {
  const old = await loaded(HIDDEN);
  assert.equal(old.passed, false);
  assert.equal(old.out.statusCode, 401);
  assert.equal(old.out.body.code, "TOKEN_STALE");
  assert.equal((await loaded(HIDDEN, { strong: true })).passed, true);
});

test("so is the system account's, and an ordinary session is untouched", async () => {
  assert.equal((await loaded(SYS)).passed, false);
  assert.equal((await loaded(SYS, { strong: true })).passed, true);
  assert.equal((await loaded({ _id: "g", tz: "5", role: "مرشد", roles: ["مرشد"] })).passed, true);
});

test("the forced-change token still reaches change-password", async () => {
  const load = pm.createLoadActor({ findActiveUserByTz: async () => HIDDEN, systemTz: "000000026", allowPasswordChange: true });
  const req = { user: { tz: HIDDEN.tz, scope: "password-change" } };
  let passed = false;
  await load(req, { status() { return this; }, json() {} }, () => { passed = true; });
  assert.equal(passed, true);
});

test("a lock shows «النظام» with no ID number for those who work unseen", () => {
  const hidden = { id: "h1", tz: HIDDEN.tz, name: "Real Person", isSystem: true, hidden: true };
  assert.deepEqual(lockOwner(hidden), { name: "النظام", tz: "" });
  assert.deepEqual(lockOwner({ tz: "5", name: "Someone" }), { name: "Someone", tz: "5" });
  assert.equal(lockedMessage(lockOwner(hidden)).includes(HIDDEN.tz), false);
  const route = fs.readFileSync(path.join(__dirname, "../Entities/Lock/Lock.route.js"), "utf8");
  assert.match(route, /lockOwner\(req\.actor\)/);
  assert.doesNotMatch(route, /name: req\.actor\.name/);
});

test("a hidden person's edit on the IT site is stamped «النظام» too", () => {
  const itActor = { id: "h1", tz: HIDDEN.tz, name: "Real Person", it: true, isSystem: false, user: HIDDEN };
  assert.equal(actorRef(itActor, HIDDEN.tz), "system");
  assert.equal(actorDisplayName(itActor), "النظام");
  assert.deepEqual(editorStamp({ actor: itActor }), { updatedBy: "system", updatedByName: "النظام" });
  const withRole = { ...itActor, user: { ...HIDDEN, role: "مرشد", roles: ["مرشد"] } };
  assert.equal(actorRef(withRole, HIDDEN.tz), HIDDEN.tz);
  assert.equal(actorDisplayName(withRole), "Real Person");
});

test("the audit log on the IT site still names him", () => {
  const { actorLabel } = pm;
  const itActor = { tz: HIDDEN.tz, name: "Real Person", it: true, isSystem: false, user: HIDDEN };
  assert.deepEqual(actorLabel(itActor), { actor: HIDDEN.tz, actorName: "Real Person" });
});

test("a hidden actor may not edit another IT user's details; 000000000 still may", () => {
  const hidden = { id: "h1", tz: HIDDEN.tz, isSystem: true, hidden: true };
  const peer = { _id: "p", tz: "7", role: "مرشد", roles: ["مرشد"], isIT: true };
  assert.equal(canEditDetails(hidden, peer), false);
  assert.equal(canEditDetails({ id: "s", tz: "000000026", isSystem: true }, peer), true);
});

test("no code is promised when email is not configured", async () => {
  const auth = createSystemCode({ codes: { get: async () => ({}) }, mailReady: () => false, systemTz: () => "000000026", systemEmail: () => "e@example.com" });
  assert.equal(await auth.send({ tz: "000000026" }), "NO_EMAIL");
  assert.equal(await auth.send({ tz: "5", email: "a@example.com" }), "NO_EMAIL");
});

test("the passkey challenge is not signed with the session secret", () => {
  process.env.JWT_ACCESS_SECRET = "session-secret";
  assert.notEqual(challengeSecret(), "session-secret");
});

test("the System code store gets its indexes at start", () => {
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(server, /ensureSystemLoginCodeIndexes/);
});

test("Sport shows no hidden person's name", () => {
  const sport = fs.readFileSync(path.join(__dirname, "../Entities/Sport/Sport.controller.js"), "utf8");
  assert.doesNotMatch(sport, /name: req\.actor\?\.name/);
  assert.match(sport, /isHiddenUser/);
  const portal = fs.readFileSync(path.join(__dirname, "../Entities/SportPortal/SportPortal.controller.js"), "utf8");
  assert.match(portal, /isHiddenUser/);
});

test("removing or blocking an IT user ends his System passkeys too", () => {
  const members = fs.readFileSync(path.join(__dirname, "../Entities/It/ItMembers.controller.js"), "utf8");
  const lines = members.split("\n").filter((l) => /"member_(remove|block)"/.test(l));
  assert.equal(lines.length, 2);
  for (const line of lines) assert.match(line, /systemPasskeys: \[\]/);
});
