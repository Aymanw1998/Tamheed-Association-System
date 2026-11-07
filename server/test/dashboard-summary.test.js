const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createDashboardRouter } = require("../Entities/Dashboard/Dashboard.route");

async function start({ permissions, handlers, dashboard = true }) {
  const seen = [];
  const requireAuth = (req, res, next) => { req.user = { tz: "t1" }; next(); };
  const loadActor = (req, res, next) => { req.actor = { id: "a1", tz: "t1", permissions: new Set([...(dashboard ? ["dashboard.view"] : []), ...permissions]) }; next(); };
  const spy = (name, fn) => async (req, res) => { seen.push([name, req.actor?.id, req.get("x-client-id")]); return fn(req, res); };
  const wrapped = Object.fromEntries(Object.entries(handlers).map(([k, fn]) => [k, spy(k, fn)]));
  const app = express();
  app.use("/api/dashboard", createDashboardRouter({ requireAuth, loadActor, handlers: () => wrapped }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const get = async () => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/dashboard/summary`, { headers: { "x-client-id": "tab-1" } });
    return { status: res.status, body: await res.json() };
  };
  return { server, get, seen };
}

const ok = (key, rows) => (req, res) => res.status(200).json({ ok: true, [key]: rows });

test("revoking dashboard.view prevents every summary data handler", async () => {
  const { server, get, seen } = await start({ permissions: ["users.view", "students.view"], dashboard: false, handlers: {} });
  try {
    assert.equal((await get()).status, 403);
    assert.deepEqual(seen, []);
  } finally { server.close(); }
});

test("one request answers all four parts, through the existing handlers with the caller's request", async () => {
  const { server, get, seen } = await start({
    permissions: ["users.view", "students.view", "lessons.view", "reports.viewAll"],
    handlers: {
      users: ok("users", [{ tz: "u1", room: "waiting" }]),
      students: ok("students", [{ tz: "s1" }, { tz: "s2" }]),
      lessons: ok("lessons", [{ _id: "l1" }]),
      reports: ok("reports", [{ _id: "r1", info: "<p>long text</p>" }, { _id: "r2" }, { _id: "r3" }]),
    },
  });
  try {
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.deepEqual(body, {
      ok: true,
      users: { ok: true, users: [{ tz: "u1", room: "waiting" }] },
      students: { ok: true, students: [{ tz: "s1" }, { tz: "s2" }] },
      lessons: { ok: true, lessons: [{ _id: "l1" }] },
      reports: { ok: true, count: 3 },
    });
    assert.equal(seen.length, 4);
    assert.ok(seen.every(([, actorId, clientId]) => actorId === "a1" && clientId === "tab-1"), "each handler sees the caller");
  } finally { server.close(); }
});

test("each part needs its route's permission (or its handler never runs); a failed part does not stop the others", async () => {
  const { server, get, seen } = await start({
    permissions: ["students.view", "lessons.view", "reports.editOwn"],
    handlers: {
      users: ok("users", [{ tz: "secret" }]),
      students: (req, res) => res.status(403).json({ ok: false, code: "FORBIDDEN" }),
      lessons: () => { throw new Error("boom"); },
      reports: ok("reports", []),
    },
  });
  try {
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.equal(body.users, null);
    assert.deepEqual(body.students, { ok: false });
    assert.deepEqual(body.lessons, { ok: false });
    assert.deepEqual(body.reports, { ok: true, count: 0 });
    assert.ok(!seen.some(([name]) => name === "users"), "the users handler never ran");
  } finally { server.close(); }
});

test("without students.view, lessons.view and a reports key those parts never leave the server", async () => {
  const { server, get, seen } = await start({
    permissions: [],
    handlers: {
      users: ok("users", [{ tz: "secret" }]),
      students: ok("students", [{ tz: "secret" }]),
      lessons: ok("lessons", [{ _id: "secret" }]),
      reports: ok("reports", [{ _id: "mine" }]),
    },
  });
  try {
    const { body } = await get();
    assert.equal(body.users, null);
    assert.equal(body.students, null);
    assert.equal(body.lessons, null);
    assert.equal(body.reports, null);
    assert.deepEqual(seen, []);
    assert.ok(!JSON.stringify(body).includes("secret"));
  } finally { server.close(); }
});

test("the report count needs some reports key, as GET /api/report does", async () => {
  for (const key of ["reports.create", "reports.editOwn", "reports.viewAll", "reports.editAll", "reports.delete", "reports.exportPdf"]) {
    const { server, get } = await start({ permissions: [key], handlers: { users: ok("users", []), students: ok("students", []), lessons: ok("lessons", []), reports: ok("reports", [{ _id: "r1" }]) } });
    try {
      const { body } = await get();
      assert.deepEqual(body.reports, { ok: true, count: 1 }, key);
    } finally { server.close(); }
  }
});
