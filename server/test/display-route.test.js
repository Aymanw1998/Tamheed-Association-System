const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const express = require("express");
const { effectivePermissions } = require("../utils/permissions");
const { requirePermission, actorLabel } = require("../middleware/permissionMiddleware");
const { objectIdParam } = require("../middleware/objectIdParam");
const { rateLimit } = require("../middleware/rateLimit");

// /api/displays (owner, 2026-11-12): management needs displays.manage; the
// feed is public, read by the secret in the body, never cached, rate-limited.

const ID = "a".repeat(24);
const SECRET = "S".repeat(43);

async function setup() {
  const calls = [];
  const fail = (status, code) => Object.assign(new Error(code), { status, code });
  const service = {
    async list() { calls.push("list"); return [{ id: ID, name: "المدخل", layout: "week", createdAt: null }]; },
    async create(body) { calls.push("create"); return { screen: { id: ID, name: body.name, layout: body.layout }, secret: SECRET }; },
    async update(id, body) { calls.push("update"); return { screen: { id, name: "المدخل", layout: body.layout } }; },
    async rotate() { calls.push("rotate"); return { secret: SECRET }; },
    async remove() { calls.push("remove"); return {}; },
    async feed(secret) {
      calls.push("feed");
      if (secret !== SECRET) throw fail(410, "LINK_CLOSED");
      return { name: "المدخل", layout: "week", serverTime: "2026-11-10T14:20:00.000Z", lessons: [] };
    },
  };
  const module = { exports: {} };
  const deps = {
    express,
    "../../middleware/authMiddleware": {
      requireAuth: (req, res, next) => (req.headers.authorization ? next() : res.status(401).json({ ok: false })),
    },
    "../../middleware/permissionMiddleware": {
      requirePermission, actorLabel,
      loadActor: (req, res, next) => {
        const grants = req.headers["x-grants"] ? req.headers["x-grants"].split(",") : [];
        const revokes = req.headers["x-revokes"] ? req.headers["x-revokes"].split(",") : [];
        req.actor = { id: "f".repeat(24), permissions: effectivePermissions({ role: "ادارة", permissionGrants: grants, permissionRevokes: revokes }) };
        next();
      },
    },
    "../../middleware/objectIdParam": { objectIdParam },
    "../../middleware/rateLimit": { rateLimit },
    "../../middleware/logger": { logWithSource() {} },
    "../../services/displayScreens": { displayScreens: () => service },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../Entities/Display/Display.route"), "utf8"), {
    module, require: (name) => { assert.ok(deps[name], name); return deps[name]; },
  });
  const app = express();
  app.use(express.json());
  app.use("/api/displays", module.exports);
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/displays`;
  const call = async (method, path, { body, grants, revokes, auth = true } = {}) => {
    const headers = { "content-type": "application/json" };
    if (auth) headers.authorization = "Bearer test";
    if (grants) headers["x-grants"] = grants.join(",");
    if (revokes) headers["x-revokes"] = revokes.join(",");
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null), cache: res.headers.get("cache-control") };
  };
  return { calls, call, close: () => new Promise((r) => server.close(r)) };
}

const MANAGEMENT = [
  ["GET", "/", undefined],
  ["POST", "/", { name: "المدخل", layout: "week" }],
  ["PUT", `/${ID}`, { layout: "today" }],
  ["POST", `/${ID}/rotate`, undefined],
  ["DELETE", `/${ID}`, undefined],
];

test("management routes answer 403 without displays.manage and 200 with it", async () => {
  const ctx = await setup();
  try {
    for (const [method, path, body] of MANAGEMENT) {
      const denied = await ctx.call(method, path, { body });
      assert.equal(denied.status, 403, `${method} ${path} without the key`);
    }
    assert.deepEqual(ctx.calls, []);
    for (const [method, path, body] of MANAGEMENT) {
      const allowed = await ctx.call(method, path, { body, grants: ["displays.manage"] });
      assert.equal(allowed.status, 200, `${method} ${path} with the key`);
      assert.equal(allowed.body.ok, true);
    }
    assert.deepEqual(ctx.calls, ["list", "create", "update", "rotate", "remove"]);
  } finally { await ctx.close(); }
});

test("a revoked displays.manage closes every management route", async () => {
  const ctx = await setup();
  try {
    for (const [method, path, body] of MANAGEMENT) {
      assert.equal((await ctx.call(method, path, { body, grants: ["displays.manage"], revokes: ["displays.manage"] })).status, 403, `${method} ${path}`);
    }
    assert.deepEqual(ctx.calls, []);
  } finally { await ctx.close(); }
});

test("management routes need sign-in", async () => {
  const ctx = await setup();
  try {
    for (const [method, path, body] of MANAGEMENT) {
      assert.equal((await ctx.call(method, path, { body, grants: ["displays.manage"], auth: false })).status, 401);
    }
  } finally { await ctx.close(); }
});

test("create and rotate return the link token once, never cached", async () => {
  const ctx = await setup();
  try {
    const created = await ctx.call("POST", "/", { body: { name: "المدخل", layout: "week" }, grants: ["displays.manage"] });
    assert.equal(created.body.token, SECRET);
    assert.equal(created.body.screen.id, ID);
    assert.match(created.cache, /no-store/);
    const rotated = await ctx.call("POST", `/${ID}/rotate`, { grants: ["displays.manage"] });
    assert.equal(rotated.body.token, SECRET);
    assert.match(rotated.cache, /no-store/);
    const listed = await ctx.call("GET", "/", { grants: ["displays.manage"] });
    assert.equal(listed.body.screens.length, 1);
    assert.ok(!JSON.stringify(listed.body).includes(SECRET));
  } finally { await ctx.close(); }
});

test("a bad id is 404 before the service", async () => {
  const ctx = await setup();
  try {
    assert.equal((await ctx.call("PUT", "/nope", { body: { layout: "week" }, grants: ["displays.manage"] })).status, 404);
    assert.deepEqual(ctx.calls, []);
  } finally { await ctx.close(); }
});

test("feed works with no sign-in, is no-store, and passes 410 through", async () => {
  const ctx = await setup();
  try {
    const ok = await ctx.call("POST", "/feed", { body: { token: SECRET }, auth: false });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, feed: { name: "المدخل", layout: "week", serverTime: "2026-11-10T14:20:00.000Z", lessons: [] } });
    assert.match(ok.cache, /no-store/);
    const gone = await ctx.call("POST", "/feed", { body: { token: "x" }, auth: false });
    assert.equal(gone.status, 410);
    assert.equal(gone.body.code, "LINK_CLOSED");
    assert.match(gone.cache, /no-store/);
    const empty = await ctx.call("POST", "/feed", { auth: false });
    assert.equal(empty.status, 410);
  } finally { await ctx.close(); }
});

// A TV checks every 10 seconds (6 a minute); up to 15 screens may share
// one address (owner, 2026-11-12: a layout change shows within seconds).
test("the 91st feed call in a minute from one address is 429", async () => {
  const ctx = await setup();
  try {
    // Earlier tests in this file already spent part of this address's budget.
    let last;
    for (let i = 0; i < 100; i += 1) {
      last = await ctx.call("POST", "/feed", { body: { token: SECRET }, auth: false });
      if (last.status === 429) break;
    }
    assert.equal(last.status, 429);
    const served = ctx.calls.filter((c) => c === "feed").length;
    assert.ok(served <= 90, `served ${served}`);
    assert.ok(served > 30, `served ${served}`);
  } finally { await ctx.close(); }
});
