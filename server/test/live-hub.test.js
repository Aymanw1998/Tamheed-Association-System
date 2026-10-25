// The in-memory live hub: instant `change` / `lock` events for staff streams
// and `me` events for sport subscribers; plus its wiring into the staff stream.
const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createLiveHub } = require("../services/liveHub");
const { createLiveRouter } = require("../Entities/Live/Live.route");

const collector = () => {
  const got = [];
  return { got, send: (type, payload) => got.push({ type, payload }) };
};

test("every staff subscriber gets a broadcast change", () => {
  const hub = createLiveHub();
  const a = collector();
  const b = collector();
  hub.subscribe("staff", "u1", a.send);
  hub.subscribe("staff", "u2", b.send);
  hub.broadcastStaff("change", { entity: "student", id: "7" });
  assert.deepEqual(a.got, [{ type: "change", payload: { entity: "student", id: "7" } }]);
  assert.deepEqual(b.got, a.got);
});

test("a sport subscriber does not get staff events", () => {
  const hub = createLiveHub();
  const staff = collector();
  const sport = collector();
  hub.subscribe("staff", "u1", staff.send);
  hub.subscribe("sport", "s1", sport.send);
  hub.broadcastStaff("lock", { key: "student:7" });
  assert.equal(staff.got.length, 1);
  assert.equal(sport.got.length, 0);
});

test("toStudents reaches only the matching sport subscriber", () => {
  const hub = createLiveHub();
  const s1 = collector();
  const s2 = collector();
  const staff = collector();
  hub.subscribe("sport", "s1", s1.send);
  hub.subscribe("sport", "s2", s2.send);
  hub.subscribe("staff", "s1", staff.send);
  hub.toStudents(["s1"], "me");
  assert.deepEqual(s1.got, [{ type: "me", payload: {} }]);
  assert.equal(s2.got.length, 0);
  assert.equal(staff.got.length, 0);
});

test("unsubscribe stops delivery", () => {
  const hub = createLiveHub();
  const a = collector();
  const off = hub.subscribe("staff", "u1", a.send);
  off();
  hub.broadcastStaff("change", { entity: "student", id: "1" });
  assert.equal(a.got.length, 0);
});

test("a subscriber whose send throws is removed and the others still receive", () => {
  const hub = createLiveHub();
  let calls = 0;
  const ok = collector();
  hub.subscribe("staff", "bad", () => { calls += 1; throw new Error("dead"); });
  hub.subscribe("staff", "ok", ok.send);
  hub.broadcastStaff("change", { entity: "student", id: "1" });
  hub.broadcastStaff("change", { entity: "student", id: "2" });
  assert.equal(calls, 1);
  assert.equal(ok.got.length, 2);
});

test("the staff stream registers with the hub and writes change events at once", async () => {
  const hub = createLiveHub();
  const subscribed = [];
  const spyHub = {
    ...hub,
    subscribe(kind, id, send) { subscribed.push({ kind, id }); return hub.subscribe(kind, id, send); },
  };
  const tickets = {
    async create() { return { success: true }; },
    async consume() { return { tz: "u-a", createdAt: new Date() }; },
  };
  const events = { async since() { return []; } };
  const loadActor = (req, res, next) => { req.actor = { tz: req.user.tz }; next(); };
  const router = createLiveRouter({
    requireAuth: (req, res, next) => next(), loadActor, tickets, events,
    hub: spyHub, pollMs: 5000, pingMs: 5000,
  });
  const app = express();
  app.use("/api/live", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const controller = new AbortController();
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/live/stream?ticket=abc`, { signal: controller.signal });
    assert.equal(res.status, 200);
    assert.deepEqual(subscribed, [{ kind: "staff", id: "u-a" }]);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("retry: 5000")) text += decoder.decode((await reader.read()).value);
    hub.broadcastStaff("change", { entity: "student", id: "7" });
    while (!text.includes("event: change")) text += decoder.decode((await reader.read()).value);
    assert.ok(text.includes('event: change\ndata: {"entity":"student","id":"7"}\n\n'));
    assert.ok(!text.includes("id: "), "hub events carry no id line");
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 50));
    hub.broadcastStaff("lock", { key: "student:7" }); // unsubscribed: must not throw
  } finally {
    controller.abort();
    router.endAllStreams();
    server.close();
  }
});
