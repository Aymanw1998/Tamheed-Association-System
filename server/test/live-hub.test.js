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
  const loadActor = (req, res, next) => { req.actor = { tz: req.user.tz, id: "u-a", permissions: new Set(["students.view"]) }; next(); };
  const router = createLiveRouter({
    requireAuth: (req, res, next) => next(), loadActor, tickets, events,
    hub: spyHub, pollMs: 5000, pingMs: 5000, visibleStudentIds: async () => null,
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

test("the staff stream sends a change or lock only to who may see that record", async () => {
  const hub = createLiveHub();
  const tickets = {
    async create() { return { success: true }; },
    async consume() { return { tz: "u-g", createdAt: new Date() }; },
  };
  const events = { async since() { return []; } };
  // A guide: sees students 7 (his) and lessons; no attendance, users, vehicles or other people's reports.
  const loadActor = (req, res, next) => { req.actor = { tz: "u-g", id: "g1", permissions: new Set(["students.view", "lessons.view", "reports.editOwn"]) }; next(); };
  const router = createLiveRouter({
    requireAuth: (req, res, next) => next(), loadActor, tickets, events,
    hub, pollMs: 5000, pingMs: 5000, visibleStudentIds: async () => new Set(["7"]),
  });
  const app = express();
  app.use("/api/live", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const controller = new AbortController();
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/live/stream?ticket=abc`, { signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("retry: 5000")) text += decoder.decode((await reader.read()).value);
    await new Promise((resolve) => setTimeout(resolve, 20)); // the visible students are read
    hub.broadcastStaff("change", { entity: "student", id: "8" }); // not his student
    hub.broadcastStaff("lock", { key: "student:8" });
    hub.broadcastStaff("lock", { key: "attendance:L1:2026-10-25" }); // no attendance.view
    hub.broadcastStaff("change", { entity: "user", id: "u9" }); // no users.view
    hub.broadcastStaff("change", { entity: "vehicle", id: "v1" });
    hub.broadcastStaff("change", { entity: "report", id: "r-other" }, { owner: "someone" });
    hub.broadcastStaff("change", { entity: "mystery", id: "x" });
    hub.broadcastStaff("change", { entity: "report", id: "r-mine" }, { owner: "g1" });
    hub.broadcastStaff("change", { entity: "lesson", id: "L1" });
    hub.broadcastStaff("change", { entity: "student", id: "7" });
    while (!text.includes('"id":"7"')) text += decoder.decode((await reader.read()).value);
    const sent = [...text.matchAll(/data: (\{.*\})/g)].map((m) => JSON.parse(m[1]));
    assert.deepEqual(sent, [
      { entity: "report", id: "r-mine" },
      { entity: "lesson", id: "L1" },
      { entity: "student", id: "7" },
    ]);
    assert.ok(!text.includes("owner"), "the audience is never sent");
  } finally {
    controller.abort();
    router.endAllStreams();
    server.close();
  }
});

test("a guide given a student mid-stream gets its events at once; the change that removes one reaches him once", async () => {
  const hub = createLiveHub();
  const clock = { now: 1_000_000 };
  let scope = new Set(["7"]);
  const tickets = {
    async create() { return { success: true }; },
    async consume() { return { tz: "u-g", createdAt: new Date() }; },
  };
  const loadActor = (req, res, next) => { req.actor = { tz: "u-g", id: "g1", permissions: new Set(["students.view"]) }; next(); };
  const router = createLiveRouter({
    requireAuth: (req, res, next) => next(), loadActor, tickets, events: { async since() { return []; } },
    hub, now: () => clock.now, pollMs: 5000, pingMs: 5000, startAt: () => 0,
    visibleStudentIds: async () => new Set(scope),
  });
  const app = express();
  app.use("/api/live", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const controller = new AbortController();
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/live/stream?ticket=abc`, { signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("retry: 5000")) text += decoder.decode((await reader.read()).value);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Student 9 moves to him, 7 leaves him; a few seconds later their records change.
    scope = new Set(["9"]);
    clock.now += 5000;
    hub.broadcastStaff("change", { entity: "student", id: "7" });
    hub.broadcastStaff("change", { entity: "student", id: "9" });
    hub.broadcastStaff("lock", { key: "student:9" });
    while (!text.includes('"key":"student:9"')) text += decoder.decode((await reader.read()).value);
    const sent = [...text.matchAll(/data: (\{.*\})/g)].map((m) => JSON.parse(m[1]));
    assert.deepEqual(sent, [{ entity: "student", id: "7" }, { entity: "student", id: "9" }, { key: "student:9" }]);
  } finally {
    controller.abort();
    router.endAllStreams();
    server.close();
  }
});

test("student scope: a failed re-read sends no student event; a student leaving the scope is announced once to the former guide", async () => {
  const hub = createLiveHub();
  const clock = { now: 1_000_000 };
  let scope = new Set(["7", "8"]);
  let failing = false;
  const tickets = {
    async create() { return { success: true }; },
    async consume() { return { tz: "u-g", createdAt: new Date() }; },
  };
  const loadActor = (req, res, next) => { req.actor = { tz: "u-g", id: "g1", permissions: new Set(["students.view", "lessons.view"]) }; next(); };
  const router = createLiveRouter({
    requireAuth: (req, res, next) => next(), loadActor, tickets, events: { async since() { return []; } },
    hub, now: () => clock.now, pollMs: 5000, pingMs: 5000, startAt: () => 0,
    visibleStudentIds: async () => { if (failing) throw new Error("db down"); return new Set(scope); },
  });
  const app = express();
  app.use("/api/live", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const controller = new AbortController();
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/live/stream?ticket=abc`, { signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const until = async (marker) => { while (!text.includes(marker)) text += decoder.decode((await reader.read()).value); };
    await until("retry: 5000");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Student 7 is moved away; the change that moved him still reaches this guide once.
    scope = new Set(["8"]);
    clock.now += 5000;
    hub.broadcastStaff("change", { entity: "student", id: "7" });
    await until('"id":"7"');
    clock.now += 500;
    hub.broadcastStaff("change", { entity: "student", id: "7" }); // fresh scope: not his any more
    hub.broadcastStaff("change", { entity: "lesson", id: "M1" });
    await until('"id":"M1"');

    // The lookup fails: no student event goes out, even for one he had.
    failing = true;
    clock.now += 5000;
    hub.broadcastStaff("change", { entity: "student", id: "8" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    hub.broadcastStaff("change", { entity: "lesson", id: "M2" });
    await until('"id":"M2"');

    const sent = [...text.matchAll(/data: (\{.*\})/g)].map((m) => JSON.parse(m[1]));
    assert.deepEqual(sent, [
      { entity: "student", id: "7" },
      { entity: "lesson", id: "M1" },
      { entity: "lesson", id: "M2" },
    ]);
  } finally {
    controller.abort();
    router.endAllStreams();
    server.close();
  }
});

test("a student leaving the scope is announced exactly once, whatever event triggers the re-read; nothing more about him follows", async () => {
  const hub = createLiveHub();
  const clock = { now: 1_000_000 };
  let scope = new Set(["7"]);
  const tickets = {
    async create() { return { success: true }; },
    async consume() { return { tz: "u-g", createdAt: new Date() }; },
  };
  const loadActor = (req, res, next) => { req.actor = { tz: "u-g", id: "g1", permissions: new Set(["students.view", "lessons.view"]) }; next(); };
  const router = createLiveRouter({
    requireAuth: (req, res, next) => next(), loadActor, tickets, events: { async since() { return []; } },
    hub, now: () => clock.now, pollMs: 5000, pingMs: 5000, startAt: () => 0,
    visibleStudentIds: async () => new Set(scope),
  });
  const app = express();
  app.use("/api/live", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const controller = new AbortController();
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/live/stream?ticket=abc`, { signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const until = async (marker) => { while (!text.includes(marker)) text += decoder.decode((await reader.read()).value); };
    await until("retry: 5000");
    await new Promise((resolve) => setTimeout(resolve, 20));

    scope = new Set();
    clock.now += 5000;
    // An unrelated student's event triggers the re-read; then events about 7 queue behind it.
    hub.broadcastStaff("change", { entity: "student", id: "99" });
    hub.broadcastStaff("change", { entity: "student", id: "7" });
    hub.broadcastStaff("lock", { key: "student:7" });
    hub.broadcastStaff("change", { entity: "student", id: "7" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    hub.broadcastStaff("change", { entity: "lesson", id: "M1" });
    await until('"id":"M1"');
    const sent = [...text.matchAll(/data: (\{.*\})/g)].map((m) => JSON.parse(m[1]));
    assert.deepEqual(sent, [{ entity: "student", id: "7" }, { entity: "lesson", id: "M1" }]);
  } finally {
    controller.abort();
    router.endAllStreams();
    server.close();
  }
});

test("removal notices: none without students.view; a removal during a failed read is still announced after recovery", async () => {
  const run = async (permissions, steps) => {
    const hub = createLiveHub();
    const clock = { now: 1_000_000 };
    const state = { scope: new Set(["7"]), failing: false };
    const tickets = {
      async create() { return { success: true }; },
      async consume() { return { tz: "u-g", createdAt: new Date() }; },
    };
    const loadActor = (req, res, next) => { req.actor = { tz: "u-g", id: "g1", permissions: new Set(permissions) }; next(); };
    const router = createLiveRouter({
      requireAuth: (req, res, next) => next(), loadActor, tickets, events: { async since() { return []; } },
      hub, now: () => clock.now, pollMs: 5000, pingMs: 5000, startAt: () => 0,
      visibleStudentIds: async () => { if (state.failing) throw new Error("db down"); return new Set(state.scope); },
    });
    const app = express();
    app.use("/api/live", router);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const controller = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/live/stream?ticket=abc`, { signal: controller.signal });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const until = async (marker) => { while (!text.includes(marker)) text += decoder.decode((await reader.read()).value); };
      await until("retry: 5000");
      await new Promise((resolve) => setTimeout(resolve, 20));
      await steps({ hub, clock, state });
      hub.broadcastStaff("change", { entity: "lesson", id: "END" });
      await until('"id":"END"');
      return [...text.matchAll(/data: (\{.*\})/g)].map((m) => JSON.parse(m[1]));
    } finally {
      controller.abort();
      router.endAllStreams();
      server.close();
    }
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  // Without students.view: no student id at all, not even a removal notice.
  const noView = await run(["lessons.view"], async ({ hub, clock, state }) => {
    state.scope = new Set();
    clock.now += 5000;
    hub.broadcastStaff("change", { entity: "student", id: "99" });
    await settle();
  });
  assert.deepEqual(noView, [{ entity: "lesson", id: "END" }]);

  // Student 7 leaves while the scope read is failing; the next good read announces it once.
  const recovered = await run(["students.view", "lessons.view"], async ({ hub, clock, state }) => {
    state.failing = true;
    clock.now += 5000;
    hub.broadcastStaff("change", { entity: "student", id: "99" });
    await settle();
    state.scope = new Set();
    state.failing = false;
    clock.now += 5000;
    hub.broadcastStaff("change", { entity: "student", id: "98" });
    await settle();
  });
  assert.deepEqual(recovered, [{ entity: "student", id: "7" }, { entity: "lesson", id: "END" }]);
});
