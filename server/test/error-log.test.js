// Server errors kept for the IT site's weekly summary (owner, 2026-11-16).
const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const { createErrorLog, pathPattern, KEEP_DAYS, MAX_PER_HOUR, TTL_INDEX } = require("../utils/errorLog");
const { createRecentErrors } = require("../utils/recentErrors");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-16T10:00:00Z");

test("record ids in a path are grouped as :id", () => {
  assert.equal(pathPattern("/api/student/65a1b2c3d4e5f60718293a4b"), "/api/student/:id");
  assert.equal(pathPattern("/api/user/123456782/active"), "/api/user/:id/active");
  assert.equal(pathPattern("/api/student/••••8155"), "/api/student/:id");
  assert.equal(pathPattern("/api/lesson"), "/api/lesson");
});

test("each error is stored without user or query; a storm stops at the hourly cap", async () => {
  const rows = [];
  const log = createErrorLog({ create: async (data) => rows.push(data), now: () => NOW });
  assert.equal(await log.record({ status: 500, method: "put", path: "/api/student/123456782", message: "boom", code: "E1", source: "Student.putS" }), true);
  assert.deepEqual({ ...rows[0], at: undefined }, { at: undefined, status: 500, action: "PUT /api/student/:id", message: "boom", code: "E1", source: "Student.putS" });
  for (let i = 1; i < MAX_PER_HOUR; i += 1) await log.record({ status: 500, path: "/x" });
  assert.equal(await log.record({ status: 500, path: "/x" }), false);
  assert.equal(rows.length, MAX_PER_HOUR);
  assert.equal(log.droppedThisHour(), 1);
});

test("the summary covers 7 days, grouped by error, the most frequent first", async () => {
  const at = (daysAgo) => new Date(NOW.getTime() - daysAgo * DAY);
  const rows = [
    { at: at(1), status: 500, action: "PUT /api/student/:id", message: "boom", code: "E1", source: "Student.putS" },
    { at: at(2), status: 500, action: "PUT /api/student/:id", message: "boom", code: "E1", source: "Student.putS" },
    { at: at(3), status: 502, action: "GET /api/vehicle", message: "drive down", code: "", source: "Vehicle.getAll" },
    { at: at(9), status: 500, action: "GET /old", message: "old", code: "", source: "x" },
  ];
  const log = createErrorLog({ read: async () => ({ result: rows }), now: () => NOW });
  const out = await log.summary();
  assert.equal(out.total, 3);
  assert.equal(out.groups.length, 2);
  assert.equal(out.groups[0].count, 2);
  assert.equal(out.groups[0].source, "Student.putS");
  assert.equal(out.perDay.length, 3);
});

test("kept 90 days", () => {
  assert.equal(KEEP_DAYS, 90);
  assert.deepEqual(TTL_INDEX.key, { at: 1 });
});

test("every 500 answer is handed to the log, without the user; a 404 is not", async () => {
  const kept = [];
  const errors = createRecentErrors({ persist: async (entry) => kept.push(entry) });
  const answer = async (status) => {
    const res = Object.assign(new EventEmitter(), { statusCode: status, setHeader() {} });
    const req = { method: "GET", originalUrl: "/api/lesson?token=secret", actor: { id: "u1" } };
    errors.middleware(req, res, () => errors.note(new Error("db down"), "Lesson.getAll"));
    res.emit("finish");
    await new Promise((resolve) => setImmediate(resolve));
  };
  await answer(500);
  await answer(404);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].path, "/api/lesson");
  assert.equal(kept[0].message, "db down");
  assert.ok(!("actorId" in kept[0]));
});
