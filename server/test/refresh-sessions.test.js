const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_SESSIONS, sessionMatches, startSession, rotateSession, endSession, endAllSessions,
  endOtherSessions, deviceLabel, deviceList, sessionEnded,
} = require("../utils/refreshSessions");

// One account may be signed in on several devices: each keeps its own
// refresh token, and only the hashes are stored (refreshHashes).

// In-memory stand-in for UserModelDef's atomic session writes.
function fakeModel(user) {
  return {
    user,
    async addRefreshHash(tz, hash, max, clearLegacy, device) {
      assert.equal(tz, user.tz);
      user.refreshHashes = [...(user.refreshHashes || []), hash].slice(-max);
      if (device) user.deviceTokens = [...(user.deviceTokens || []), device].slice(-max);
      if (clearLegacy) user.refreshHash = null;
    },
    async dropRefreshHash(tz, hash) {
      assert.equal(tz, user.tz);
      user.refreshHashes = (user.refreshHashes || []).filter((h) => h !== hash);
      if (user.deviceTokens) user.deviceTokens = user.deviceTokens.filter((d) => d.hash !== hash);
      if (user.refreshHash === hash) user.refreshHash = null;
    },
    async keepOnlyRefreshHash(tz, hash) {
      assert.equal(tz, user.tz);
      user.refreshHashes = [hash];
      user.deviceTokens = (user.deviceTokens || []).filter((d) => d.hash === hash);
      user.refreshHash = null;
    },
  };
}

test("two devices signed in keep working side by side", async () => {
  const m = fakeModel({ tz: "1" });
  await startSession(m, "1", "phone");
  await startSession(m, "1", "laptop");
  assert.equal(sessionMatches(m.user, "phone"), true);
  assert.equal(sessionMatches(m.user, "laptop"), true);
  assert.equal(sessionMatches(m.user, "stranger"), false);
});

test("a refresh replaces only that device's token", async () => {
  const m = fakeModel({ tz: "1" });
  await startSession(m, "1", "phone");
  await startSession(m, "1", "laptop");
  await rotateSession(m, m.user, "phone", "phone2");
  assert.deepEqual(m.user.refreshHashes, ["laptop", "phone2"]);
});

test("signing out ends only that device", async () => {
  const m = fakeModel({ tz: "1" });
  await startSession(m, "1", "phone");
  await startSession(m, "1", "laptop");
  await endSession(m, "1", "phone");
  assert.equal(sessionMatches(m.user, "phone"), false);
  assert.equal(sessionMatches(m.user, "laptop"), true);
});

test("only the most recent sessions are kept", async () => {
  const m = fakeModel({ tz: "1" });
  for (let i = 0; i <= MAX_SESSIONS; i += 1) await startSession(m, "1", `d${i}`);
  assert.equal(m.user.refreshHashes.length, MAX_SESSIONS);
  assert.equal(sessionMatches(m.user, "d0"), false);
  assert.equal(sessionMatches(m.user, `d${MAX_SESSIONS}`), true);
});

test("a session from before the change (refreshHash) still refreshes and moves to the list", async () => {
  const m = fakeModel({ tz: "1", refreshHash: "old" });
  assert.equal(sessionMatches(m.user, "old"), true);
  await rotateSession(m, m.user, "old", "new");
  assert.equal(m.user.refreshHash, null);
  assert.deepEqual(m.user.refreshHashes, ["new"]);
});

test("ending all sessions clears the list and the old field", () => {
  assert.deepEqual(endAllSessions(), { refreshHash: null, refreshHashes: [], deviceTokens: [] });
});

test("an empty hash never matches", () => {
  assert.equal(sessionMatches({ refreshHash: null, refreshHashes: [] }, ""), false);
  assert.equal(sessionMatches(null, "x"), false);
});

test("the audit log never shows the session hashes", () => {
  const { diffChanges } = require("../utils/audit");
  const changes = diffChanges({ refreshHashes: ["a"] }, { refreshHashes: ["a", "b"] });
  assert.equal(JSON.stringify(changes).includes("\"b\""), false);
});

test("two refresh tokens signed in the same second for the same user differ", () => {
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-secret";
  const { signRefreshToken } = require("../utils/jwt");
  const claims = { id: "u1", tz: "1", roles: [], room: "active" };
  assert.notEqual(signRefreshToken(claims), signRefreshToken(claims));
});

// "My devices" (2026-11-01): each session has an id (sid, kept across
// refreshes), the device it was started on, and when it was last used.

test("the device name is read from the browser line", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), "Safari · iPhone");
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36"), "Chrome · Android");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0"), "Edge · Windows");
  assert.equal(deviceLabel(undefined), "");
});

test("a signed-in device is listed with its name and times, the current one marked", async () => {
  const m = fakeModel({ tz: "1" });
  await startSession(m, "1", "phone", { sid: "s1", label: "Safari · iPhone" });
  await startSession(m, "1", "laptop", { sid: "s2", label: "Chrome · Windows" });
  const list = deviceList(m.user, "s2");
  assert.equal(list.length, 2);
  const laptop = list.find((d) => d.sid === "s2");
  assert.equal(laptop.label, "Chrome · Windows");
  assert.equal(laptop.current, true);
  assert.ok(laptop.startedAt instanceof Date && laptop.lastSeenAt instanceof Date);
  assert.equal(list.find((d) => d.sid === "s1").current, false);
  assert.equal(JSON.stringify(list).includes("phone"), false, "the token hash is never listed");
});

test("a refresh keeps the device's id, name and start time and updates when it was last used", async () => {
  const m = fakeModel({ tz: "1" });
  await startSession(m, "1", "phone", { sid: "s1", label: "Safari · iPhone" });
  const started = m.user.deviceTokens[0].startedAt;
  m.user.deviceTokens[0].lastSeenAt = new Date(0);
  await rotateSession(m, m.user, "phone", "phone2", { sid: "s1", label: "ignored" });
  const [device] = deviceList(m.user, "s1");
  assert.equal(device.sid, "s1");
  assert.equal(device.label, "Safari · iPhone");
  assert.equal(device.startedAt, started);
  assert.ok(device.lastSeenAt.getTime() > 0);
  assert.equal(m.user.deviceTokens.length, 1);
});

test("a session from before devices were listed gets a device entry at its next refresh", async () => {
  const m = fakeModel({ tz: "1", refreshHashes: ["old"] });
  assert.deepEqual(deviceList(m.user, "x"), []);
  await rotateSession(m, m.user, "old", "new", { sid: "s9", label: "Chrome · Android" });
  assert.equal(deviceList(m.user, "s9")[0].current, true);
});

test("the list shows the most recently used device first and hides ended sessions", async () => {
  const m = fakeModel({ tz: "1" });
  await startSession(m, "1", "a", { sid: "sa", label: "A" });
  await startSession(m, "1", "b", { sid: "sb", label: "B" });
  m.user.deviceTokens[0].lastSeenAt = new Date(2000, 0, 2);
  m.user.deviceTokens[1].lastSeenAt = new Date(2000, 0, 1);
  assert.deepEqual(deviceList(m.user).map((d) => d.sid), ["sa", "sb"]);
  m.user.refreshHashes = ["b"];
  assert.deepEqual(deviceList(m.user).map((d) => d.sid), ["sb"]);
});

test("signing out other devices keeps only this one", async () => {
  const m = fakeModel({ tz: "1", refreshHash: "legacy" });
  await startSession(m, "1", "a", { sid: "sa", label: "A" });
  await startSession(m, "1", "b", { sid: "sb", label: "B" });
  await endOtherSessions(m, "1", "b");
  assert.equal(sessionMatches(m.user, "a"), false);
  assert.equal(sessionMatches(m.user, "legacy"), false);
  assert.equal(sessionMatches(m.user, "b"), true);
  assert.deepEqual(deviceList(m.user).map((d) => d.sid), ["sb"]);
});

test("a token of a device that was signed out is ended at once", async () => {
  const m = fakeModel({ tz: "1" });
  await startSession(m, "1", "a", { sid: "sa", label: "A" });
  await startSession(m, "1", "b", { sid: "sb", label: "B" });
  assert.equal(sessionEnded("sa", m.user), false);
  await endSession(m, "1", "a");
  assert.equal(sessionEnded("sa", m.user), true);
  assert.equal(sessionEnded("sb", m.user), false);
  // Tokens from before session ids, and accounts with no device list yet.
  assert.equal(sessionEnded(undefined, m.user), false);
  assert.equal(sessionEnded("sa", { refreshHashes: ["a"] }), false);
});

test("the audit log never shows the device tokens", () => {
  const { diffChanges } = require("../utils/audit");
  const changes = diffChanges({ deviceTokens: [] }, { deviceTokens: [{ sid: "s", hash: "secret-hash" }] });
  assert.equal(JSON.stringify(changes).includes("secret-hash"), false);
});
