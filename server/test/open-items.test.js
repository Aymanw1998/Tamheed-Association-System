// The items left open after the review of the hidden-IT work (2026-11-04).
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.SYSTEM_ADMIN_TZ = "000000026";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
const { inHiddenFolder, hiddenFolderSet } = require("../utils/hiddenFolders");
const { createAdminPowers } = require("../Entities/It/AdminPowers.controller");
const { adminPowersOn, setAdminPowers } = require("../utils/permissionRules");
const { createSystemCode } = require("../Entities/User/SystemCode.auth");
const { scrub } = require("../services/assistant/toolRegistry");
const errorHandler = require("../middleware/err");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const HIDDEN = { _id: "h1", tz: "100000009", firstname: "Real", isIT: true };
const GUIDE = { _id: "g1", tz: "100000017", firstname: "A", role: "مرشد", roles: ["مرشد"] };

test("a hidden person's folder and what is inside it stay out of a listing; others stay", () => {
  const set = hiddenFolderSet([HIDDEN, GUIDE], (user) => [`users/${user.tz}`]);
  assert.equal(inHiddenFolder(`users/${HIDDEN.tz}`, set), true);
  assert.equal(inHiddenFolder(`users/${HIDDEN.tz}/a/b.pdf`, set), true);
  assert.equal(inHiddenFolder(`users/${GUIDE.tz}`, set), false);
  assert.equal(inHiddenFolder(`users/${HIDDEN.tz}9`, set), false);
  assert.equal(inHiddenFolder("", set), false);
});

test("the listing uses it", () => {
  assert.match(read("Entities/Storage/Storage.controller.js"), /inHiddenFolder\(/);
});

test("the lock check on a user route answers nothing for a hidden person", () => {
  const route = read("Entities/User/User.route.js");
  assert.match(route, /isHiddenUser\(user\)/);
});

test("a notice sent to the browser carries no list of readers", () => {
  const source = read("Entities/Notice/Notice.service.js");
  assert.match(source, /const withRead = \(\{ readBy, readTimes, hiddenBy, \.\.\.row \}, userId\)/);
});

test("the assistant blanks a hidden person's ID number wherever it appears", () => {
  const hidden = new Set([HIDDEN.tz]);
  const out = scrub({ note: HIDDEN.tz, other: GUIDE.tz, list: [{ tz: HIDDEN.tz }, { tz: GUIDE.tz }] }, "000000026", hidden);
  assert.equal(out.note, "");
  assert.equal(out.other, GUIDE.tz);
  assert.deepEqual(out.list, [{ tz: GUIDE.tz }]);
  assert.match(read("services/assistant/toolRegistry.js"), /hiddenTzs = new Set\(rows\(await d\.models/);
});

test("if the switch cannot be read at start, the powers are off", async () => {
  try {
    await createAdminPowers({ model: { readKey: async () => { throw new Error("db down"); } }, audit: {} }).load();
    assert.equal(adminPowersOn(), false);
  } finally {
    setAdminPowers(true);
  }
});

test("a code ticket opens only its own ID number, and only with a valid signature", () => {
  const auth = createSystemCode({ codes: {}, mailReady: () => true });
  const ticket = auth.ticketFor("100000009");
  assert.equal(auth.ticketOk("100000009", ticket), true);
  assert.equal(auth.ticketOk("100000017", ticket), false);
  assert.equal(auth.ticketOk("100000009", "forged"), false);
  assert.equal(auth.ticketOk("100000009", undefined), false);
});

test("a code ticket expires with the code", () => {
  let t = Date.parse("2026-11-04T10:00:00Z");
  const auth = createSystemCode({ codes: {}, mailReady: () => true, now: () => t });
  const ticket = auth.ticketFor("100000009");
  t += 10 * 60 * 1000 + 1000;
  assert.equal(auth.ticketOk("100000009", ticket), false);
});

test("a code ticket is no session token", () => {
  const jwt = require("jsonwebtoken");
  const ticket = createSystemCode({ codes: {}, mailReady: () => true }).ticketFor("100000009");
  assert.throws(() => jwt.verify(ticket, process.env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }));
});

test("a file system error reaches the visitor without its path", () => {
  const err = Object.assign(new Error("ENOENT: no such file or directory, stat '/var/www/tamheed/apps/system/build/index.html'"), { code: "ENOENT", syscall: "stat", statusCode: 404 });
  const out = { status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } };
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    errorHandler(err, {}, out, () => {});
  } finally {
    process.env.NODE_ENV = saved;
  }
  assert.doesNotMatch(JSON.stringify(out.body), /var\/www|ENOENT/);
  assert.equal(out.body.success, false);
});

test("the update script builds aside and swaps only after every build succeeded", () => {
  const script = read("../deploy/update.sh");
  execFileSync("bash", ["-n", path.join(__dirname, "../../deploy/update.sh")]);
  assert.doesNotMatch(script, /^\s*(CI=false )?npm run build --prefix apps\//m);
  for (const app of ["system", "sport", "it"]) assert.match(script, new RegExp(`build_aside ${app}`));
  const lastBuild = script.lastIndexOf("build_aside it");
  const firstSwap = script.indexOf("swap_in system");
  assert.ok(firstSwap > lastBuild, "no swap before the last build");
  assert.ok(script.indexOf("pm2 reload") > firstSwap);
  assert.match(read("../.gitignore"), /build\.new/);
});
