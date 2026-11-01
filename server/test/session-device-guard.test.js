const assert = require("node:assert/strict");
const test = require("node:test");

// "My devices" (2026-11-01): a device signed out from the list is refused on
// its next request, not when its 15-minute access token expires.

test("requireAuth passes the session id on to loadActor", () => {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-secret";
  const { signAccessToken } = require("../utils/jwt");
  const { requireAuth } = require("../middleware/authMiddleware");
  const req = { headers: { authorization: "Bearer " + signAccessToken({ id: "x", tz: "t", sid: "s1" }) } };
  requireAuth(req, {}, () => {});
  assert.equal(req.user.sid, "s1");
});

test("loadActor answers 401 TOKEN_STALE for a device signed out from the list", async () => {
  const { createLoadActor } = require("../middleware/permissionMiddleware");
  const user = { tz: "u1", role: "مرشد", refreshHashes: ["h2"], deviceTokens: [{ sid: "s2", hash: "h2" }] };
  const loadActor = createLoadActor({ systemTz: "999", findActiveUserByTz: async () => user });
  const run = async (sid) => {
    let status = 200; let body; let passed = false;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
    await loadActor({ user: { tz: "u1", iat: Math.floor(Date.now() / 1000), sid } }, res, () => { passed = true; });
    return { status, body, passed };
  };
  const ended = await run("s1");
  assert.equal(ended.status, 401);
  assert.equal(ended.body.code, "TOKEN_STALE");
  assert.equal((await run("s2")).passed, true);
  assert.equal((await run(undefined)).passed, true, "a token from before session ids");
});
