const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { diffChanges, createAudit } = require("../utils/audit");
const { createAuditRouter, buildFilter } = require("../Entities/Audit/Audit.route");
const { actorFor } = require("./helpers/actors");

test("diffChanges keeps only changed fields and ignores updatedAt", () => {
  const changes = diffChanges(
    { firstname: "A", lastname: "B", updatedAt: 1 },
    { firstname: "A", lastname: "C", updatedAt: 2, phone: "1" }
  );
  assert.deepEqual(changes, {
    lastname: { before: "B", after: "C" },
    phone: { before: undefined, after: "1" },
  });
});

test("diffChanges redacts secrets, tokens and OTPs", () => {
  const changes = diffChanges(
    { password: "old", refreshHash: "h1", resetOtpHash: "o1", inviteToken: "t1", resetOtpExpires: 1, name: "x" },
    { password: "new", refreshHash: "h2", resetOtpHash: "o2", inviteToken: "t2", resetOtpExpires: 2, name: "y" }
  );
  for (const key of ["password", "refreshHash", "resetOtpHash", "inviteToken", "resetOtpExpires"]) {
    assert.deepEqual(changes[key], { before: "***", after: "***" }, key);
  }
  assert.deepEqual(changes.name, { before: "x", after: "y" });
});

test("diffChanges handles missing before/after", () => {
  assert.deepEqual(diffChanges(null, { a: 1 }), { a: { before: undefined, after: 1 } });
  assert.deepEqual(diffChanges({ a: 1 }, undefined), { a: { before: 1, after: undefined } });
  assert.deepEqual(diffChanges(undefined, undefined), {});
});

test("record stores the actor, ip and time; system actor is stored as system", async () => {
  const rows = [];
  const model = { create: async (row) => rows.push(row) };
  const now = () => new Date("2026-01-01T00:00:00Z");
  const audit = createAudit({ model, now });

  await audit.record(
    { actor: actorFor({ tz: "111", firstname: "Dana", lastname: "Lev" }), ip: "1.2.3.4" },
    { module: "users", action: "update", targetType: "user", targetId: "u1", targetLabel: "Sam", before: { a: 1 }, after: { a: 2 } }
  );
  await audit.record(
    { actor: actorFor({ tz: "000" }, { isSystem: true }), ip: "::1" },
    { module: "users", action: "delete", targetType: "user", targetId: "u2" }
  );
  assert.equal(rows[0].actor, "111");
  assert.equal(rows[0].actorName, "Dana Lev");
  assert.equal(rows[0].ip, "1.2.3.4");
  assert.equal(rows[0].at.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.deepEqual(rows[0].changes, { a: { before: 1, after: 2 } });
  assert.equal(rows[1].actor, "system");
  assert.equal(rows[1].actorName, "النظام");
});

test("record never throws when the model fails", async () => {
  const audit = createAudit({ model: { create: async () => { throw new Error("db down"); } } });
  await assert.doesNotReject(() => audit.record({ actor: actorFor({ tz: "1" }) }, { module: "m", action: "create" }));
  await assert.doesNotReject(() => audit.record(undefined, undefined));
});

test("buildFilter maps the query to a Mongo filter", () => {
  const f = buildFilter({
    from: "2026-01-01", to: "2026-01-31", module: "users", actor: "111", action: "update", targetId: "u1", q: "a.b",
  });
  assert.equal(f.module, "users");
  assert.equal(f.actor, "111");
  assert.equal(f.action, "update");
  assert.equal(f.targetId, "u1");
  assert.ok(f.at.$gte instanceof Date && f.at.$lte instanceof Date);
  assert.ok(f.$or.every((c) => Object.values(c)[0].$regex === "a\\.b"));
  assert.deepEqual(buildFilter({}), {});
  assert.throws(() => buildFilter({ from: "garbage" }), { code: "BAD_DATE" });
});

function startApp({ permissions = [], rows = [] } = {}) {
  const seen = {};
  const model = {
    async page(filter, opts) { seen.filter = filter; seen.opts = opts; return { items: rows, total: rows.length }; },
  };
  const requireAuth = (req, res, next) => { req.user = { tz: "1" }; next(); };
  const loadActor = (req, res, next) => {
    req.actor = { permissions: new Set(permissions) };
    next();
  };
  const app = express();
  app.use("/api/audit", createAuditRouter({ model, requireAuth, loadActor }));
  const server = http.createServer(app);
  return new Promise((resolve) =>
    server.listen(0, () => resolve({ server, seen, base: `http://127.0.0.1:${server.address().port}/api/audit` }))
  );
}

test("GET without audit.view is 403", async () => {
  const { server, base } = await startApp({ permissions: [] });
  try {
    assert.equal((await fetch(base)).status, 403);
  } finally { server.close(); }
});

test("GET with audit.view returns a page of 50, newest first", async () => {
  const { server, base, seen } = await startApp({ permissions: ["audit.view"], rows: [{ action: "create" }] });
  try {
    const res = await fetch(`${base}?module=users&page=3`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, items: [{ action: "create" }], total: 1 });
    assert.equal(seen.filter.module, "users");
    assert.deepEqual(seen.opts, { page: 3, pageSize: 50 });
  } finally { server.close(); }
});

test("DELETE /api/audit/x is 404", async () => {
  const { server, base } = await startApp({ permissions: ["audit.view"] });
  try {
    assert.equal((await fetch(`${base}/x`, { method: "DELETE" })).status, 404);
  } finally { server.close(); }
});

test("diffChanges redacts secrets nested in objects and arrays, and widened names", () => {
  const changes = diffChanges(
    { profile: { password: "p1", city: "x" }, list: [{ refreshHash: "h", ok: 1 }], apiKey: "k1", otpCode: "1", rootPath: "/a", code: "c1" },
    { profile: { password: "p2", city: "y" }, list: [{ refreshHash: "h2", ok: 1 }], apiKey: "k2", otpCode: "2", rootPath: "/b", code: "c2" }
  );
  assert.deepEqual(changes.profile, { before: { password: "***", city: "x" }, after: { password: "***", city: "y" } });
  assert.deepEqual(changes.list, { before: [{ refreshHash: "***", ok: 1 }], after: [{ refreshHash: "***", ok: 1 }] });
  assert.deepEqual(changes.apiKey, { before: "***", after: "***" });
  assert.deepEqual(changes.otpCode, { before: "***", after: "***" });
  assert.deepEqual(changes.rootPath, { before: "/a", after: "/b" });
  assert.deepEqual(changes.code, { before: "c1", after: "c2" });
});

test("page is capped and q is truncated", async () => {
  const { server, base, seen } = await startApp({ permissions: ["audit.view"] });
  try {
    await fetch(base + "?page=99999999999&q=" + "a".repeat(500));
    assert.equal(seen.opts.page, 10000);
    assert.equal(seen.filter.$or[0].targetLabel.$regex.length, 100);
    await fetch(base + "?page=-4");
    assert.equal(seen.opts.page, 1);
  } finally { server.close(); }
});

// ---- system TZ masking (fake TZ only) ----
const FAKE_SYS = "900000001";
async function withSysTz(value, fn) {
  const prev = process.env.SYSTEM_ADMIN_TZ;
  if (value === undefined) delete process.env.SYSTEM_ADMIN_TZ; else process.env.SYSTEM_ADMIN_TZ = value;
  try { await fn(); } finally {
    if (prev === undefined) delete process.env.SYSTEM_ADMIN_TZ; else process.env.SYSTEM_ADMIN_TZ = prev;
  }
}
function recorder() {
  const rows = [];
  return { rows, audit: createAudit({ model: { create: async (r) => rows.push(r) } }) };
}

test("record masks the system TZ and name for the system user target", async () => {
  await withSysTz(FAKE_SYS, async () => {
    const { rows, audit } = recorder();
    await audit.record({ actor: actorFor({ tz: "111" }) }, {
      module: "users", action: "update", targetType: "user", targetId: FAKE_SYS, targetLabel: "Real Name",
      before: { tz: FAKE_SYS, phone: "1" }, after: { tz: FAKE_SYS, phone: "2" },
    });
    assert.equal(rows[0].targetId, "system");
    assert.equal(rows[0].targetLabel, "النظام");
    assert.ok(!JSON.stringify(rows[0]).includes(FAKE_SYS));
  });
});

test("record masks when only the target doc tz is the system TZ", async () => {
  await withSysTz(FAKE_SYS, async () => {
    const { rows, audit } = recorder();
    await audit.record({ actor: actorFor({ tz: "111" }) }, {
      module: "users", action: "update", targetType: "user", targetId: "u1", targetLabel: "Real Name",
      before: { tz: FAKE_SYS, phone: "1" }, after: { tz: FAKE_SYS, phone: "2" },
    });
    assert.equal(rows[0].targetId, "system");
    assert.equal(rows[0].targetLabel, "النظام");
    assert.ok(!JSON.stringify(rows[0]).includes(FAKE_SYS));
  });
});

test("record masks users/<systemTz> path segments and nested exact values", async () => {
  await withSysTz(FAKE_SYS, async () => {
    const { rows, audit } = recorder();
    await audit.record({ actor: actorFor({ tz: "111" }) }, {
      module: "storage", action: "rename", targetType: "file", targetId: `users/${FAKE_SYS}/x`, targetLabel: `users/${FAKE_SYS}/x`,
      before: { path: `users/${FAKE_SYS}/x`, list: [{ owner: FAKE_SYS }] },
      after: { path: `users/${FAKE_SYS}/y`, list: [{ owner: FAKE_SYS }] },
    });
    assert.equal(rows[0].targetId, "users/system/x");
    assert.equal(rows[0].targetLabel, "users/system/x");
    assert.deepEqual(rows[0].changes.path, { before: "users/system/x", after: "users/system/y" });
    assert.ok(!JSON.stringify(rows[0]).includes(FAKE_SYS));
  });
});

test("record does not mask when SYSTEM_ADMIN_TZ is blank or unset", async () => {
  for (const value of ["", "  ", undefined]) {
    await withSysTz(value, async () => {
      const { rows, audit } = recorder();
      await audit.record({ actor: actorFor({ tz: "111" }) }, {
        module: "users", action: "update", targetType: "user", targetId: "", targetLabel: "",
        before: { tz: "", a: "users//x" }, after: { tz: "5", a: "users//x" },
      });
      assert.equal(rows[0].targetId, "");
      assert.equal(rows[0].targetLabel, "");
      assert.deepEqual(rows[0].changes, { tz: { before: "", after: "5" } });
    });
  }
});

// ---- Asia/Jerusalem date filters ----
test("buildFilter treats date-only from/to as whole Jerusalem days (summer and winter)", () => {
  const summer = buildFilter({ from: "2026-07-01", to: "2026-07-01" }); // UTC+3
  assert.equal(summer.at.$gte.toISOString(), "2026-06-30T21:00:00.000Z");
  assert.equal(summer.at.$lte.toISOString(), "2026-07-01T20:59:59.999Z");
  const winter = buildFilter({ from: "2026-01-15", to: "2026-01-15" }); // UTC+2
  assert.equal(winter.at.$gte.toISOString(), "2026-01-14T22:00:00.000Z");
  assert.equal(winter.at.$lte.toISOString(), "2026-01-15T21:59:59.999Z");
});

test("buildFilter keeps explicit time/offset inputs as given", () => {
  const f = buildFilter({ from: "2026-07-01T10:00:00Z", to: "2026-07-01T12:00:00+03:00" });
  assert.equal(f.at.$gte.toISOString(), "2026-07-01T10:00:00.000Z");
  assert.equal(f.at.$lte.toISOString(), "2026-07-01T09:00:00.000Z");
});

test("invalid dates give 400 BAD_DATE", async () => {
  const { server, base } = await startApp({ permissions: ["audit.view"] });
  try {
    for (const q of ["from=garbage", "to=2026-13-45", "from=2026-02-30"]) {
      const res = await fetch(`${base}?${q}`);
      assert.equal(res.status, 400, q);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.code, "BAD_DATE");
    }
  } finally { server.close(); }
});

test("ensureAuditIndexes creates the time and target indexes", async () => {
  const { ensureAuditIndexes, AUDIT_INDEXES } = require("../Entities/Audit/Audit.model");
  const calls = [];
  await ensureAuditIndexes({ createIndex: async (spec) => calls.push(spec) });
  assert.deepEqual(AUDIT_INDEXES, [{ at: -1 }, { targetId: 1, at: -1 }]);
  assert.deepEqual(calls, [{ at: -1 }, { targetId: 1, at: -1 }]);
});
