// /api/nasheed (owner, 2026-11-27): only on NASHEED_HOST; guests read titles
// and lines; every write needs the nasheed session; nothing is cached or
// listed by search engines. Synthetic values only.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const cookieParser = require("cookie-parser");

process.env.NASHEED_HOST = "nasheed.example.test";
const { createNasheedRouter } = require("../Entities/Nasheed/Nasheed.route");

const ID = "a".repeat(24);
const NASHEED = { _id: ID, title: "أوقدت", lines: [{ kind: "verse", sadr: "ص", ajuz: "ع" }], updatedAt: "2026-11-27T10:00:00.000Z" };

async function setup() {
  const calls = [];
  const audits = [];
  const fail = (status, code) => Object.assign(new Error(code), { status, code });
  const library = {
    async list() { calls.push("list"); return [{ ...NASHEED, createdBy: { tz: "1" } }]; },
    async get(id) { calls.push("get"); if (id !== ID) throw fail(404, "NOT_FOUND"); return { ...NASHEED, updatedBy: { tz: "1" } }; },
    async create(body) { calls.push("create"); return { ...NASHEED, title: body.title }; },
    async update(id, body) { calls.push("update"); return { ...NASHEED, title: body.title }; },
    async remove() { calls.push("remove"); return { trashId: "t1" }; },
  };
  const bin = {
    async get(id) { return { t1: { _id: "t1", kind: "nasheed", refId: ID, label: "أوقدت" }, t2: { _id: "t2", kind: "student", refId: "s" } }[id] || null; },
    async restore(entry) { calls.push(`restore:${entry._id}`); return { ok: true }; },
  };
  const signedIn = (req, res, next) => {
    if (!req.cookies?.nasheed_session) return res.status(401).json({ ok: false, code: "NASHEED_SIGNED_OUT" });
    req.actor = { tz: "900000002", name: "منشد", permissions: new Set(["nasheeds.manage"]) };
    return next();
  };
  const auth = {
    login: (req, res) => res.json({ ok: true }),
    logout: (req, res) => res.json({ ok: true }),
    me: (req, res) => res.json({ ok: true, user: { name: req.actor.name } }),
  };
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/nasheed", createNasheedRouter({ library: () => library, bin: () => bin, auth, requireNasheed: signedIn, audit: { record: async (req, entry) => audits.push(entry) } }));
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const port = server.address().port;
  // fetch() drops a Host header, so plain http.request.
  const call = (method, path, { body, host = "nasheed.example.test", session = false } = {}) => new Promise((resolve, reject) => {
    const headers = { Host: host, "Content-Type": "application/json" };
    if (session) headers.Cookie = "nasheed_session=x";
    const data = body && method !== "GET" ? JSON.stringify(body) : "";
    headers["Content-Length"] = Buffer.byteLength(data);
    const request = http.request({ host: "127.0.0.1", port, method, path: `/api/nasheed${path}`, headers }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: { get: (name) => res.headers[name] }, body: parsed });
      });
    });
    request.on("error", reject);
    request.end(data);
  });
  return { call, calls, audits, close: () => new Promise((r) => server.close(r)) };
}

test("every route answers 404 on another host and without NASHEED_HOST", async () => {
  const w = await setup();
  try {
    for (const [method, path] of [["GET", "/public"], ["GET", `/public/${ID}`], ["POST", "/login"], ["GET", "/me"], ["POST", "/"], ["PUT", `/${ID}`], ["DELETE", `/${ID}`], ["POST", "/restore/t1"]]) {
      assert.equal((await w.call(method, path, { host: "example.test", session: true })).status, 404, `${method} ${path}`);
    }
    const saved = process.env.NASHEED_HOST;
    delete process.env.NASHEED_HOST;
    try {
      assert.equal((await w.call("GET", "/public")).status, 404);
    } finally {
      process.env.NASHEED_HOST = saved;
    }
    assert.deepEqual(w.calls, []);
  } finally { await w.close(); }
});

test("the public read sends exactly _id, title, lines and updatedAt", async () => {
  const w = await setup();
  try {
    const list = await w.call("GET", "/public");
    assert.equal(list.status, 200);
    assert.deepEqual(Object.keys(list.body.nasheeds[0]).sort(), ["_id", "lines", "title", "updatedAt"]);
    const one = await w.call("GET", `/public/${ID}`);
    assert.deepEqual(Object.keys(one.body.nasheed).sort(), ["_id", "lines", "title", "updatedAt"]);
    assert.equal((await w.call("GET", `/public/${"b".repeat(24)}`)).status, 404);
    assert.equal(list.headers.get("cache-control"), "no-store");
  } finally { await w.close(); }
});

test("every write answers 401 without a session and works with one", async () => {
  const w = await setup();
  try {
    for (const [method, path] of [["GET", "/me"], ["POST", "/"], ["PUT", `/${ID}`], ["DELETE", `/${ID}`], ["POST", "/restore/t1"]]) {
      assert.equal((await w.call(method, path, { body: { title: "x" } })).status, 401, `${method} ${path}`);
    }
    assert.deepEqual(w.calls, []);
    assert.equal((await w.call("POST", "/", { body: { title: "جديد" }, session: true })).body.nasheed.title, "جديد");
    assert.equal((await w.call("PUT", `/${ID}`, { body: { title: "معدّل" }, session: true })).body.nasheed.title, "معدّل");
    assert.equal((await w.call("DELETE", `/${ID}`, { session: true })).body.trashId, "t1");
  } finally { await w.close(); }
});

test("restore brings back a nasheed from the bin, refuses another kind's entry, and is audited", async () => {
  const w = await setup();
  try {
    assert.equal((await w.call("POST", "/restore/t2", { session: true })).status, 404);
    assert.equal((await w.call("POST", "/restore/nope", { session: true })).status, 404);
    const ok = await w.call("POST", "/restore/t1", { session: true });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, id: ID });
    assert.deepEqual(w.calls, ["restore:t1"]);
    assert.equal(w.audits.filter((a) => a.module === "nasheeds" && a.action === "restore").length, 1);
  } finally { await w.close(); }
});

test("responses on the nasheed host carry X-Robots-Tag: noindex", async () => {
  const w = await setup();
  try {
    assert.equal((await w.call("GET", "/public")).headers.get("x-robots-tag"), "noindex");
    assert.equal((await w.call("POST", "/")).headers.get("x-robots-tag"), "noindex");
  } finally { await w.close(); }
});

test("a whole band on one Wi-Fi (one address) can read without being limited", async () => {
  const w = await setup();
  try {
    let last = 0;
    for (let i = 0; i < 300; i += 1) last = (await w.call("GET", `/public/${ID}`)).status;
    assert.equal(last, 200);
  } finally { await w.close(); }
});
