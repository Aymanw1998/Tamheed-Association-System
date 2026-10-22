const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_TOURS,
  parseTourUpdate,
  mergeKnownKeys,
  mergeSeenReleases,
  tourSummary,
  applyTour,
} = require("../utils/tourState");

test("parseTourUpdate accepts a valid update", () => {
  assert.deepEqual(
    parseTourUpdate("students", { status: "done", version: 1 }),
    { id: "students", status: "done", version: 1 },
  );
  assert.deepEqual(
    parseTourUpdate("welcome", { status: "skipped", version: 1000 }),
    { id: "welcome", status: "skipped", version: 1000 },
  );
});

test("parseTourUpdate rejects bad ids, statuses and versions", () => {
  const ok = { status: "done", version: 1 };
  for (const id of ["__proto__", "Students", "a".repeat(41), "", "1abc", null]) {
    assert.equal(parseTourUpdate(id, ok), null, String(id));
  }
  for (const status of ["admin", "", undefined, 1]) {
    assert.equal(parseTourUpdate("students", { ...ok, status }), null);
  }
  for (const version of [0, 1.5, "1", 1001, -1, null, undefined]) {
    assert.equal(parseTourUpdate("students", { ...ok, version }), null);
  }
  assert.equal(parseTourUpdate("students", null), null);
});

test("mergeKnownKeys keeps only held string keys, unioned and sorted", () => {
  const held = new Set(["students.view"]);
  assert.deepEqual(mergeKnownKeys(null, ["students.view", "users.view", 7], held), ["students.view"]);
  assert.deepEqual(mergeKnownKeys(["a.b"], "x", held), ["a.b"]);
  assert.deepEqual(
    mergeKnownKeys(["z.z", "students.view"], ["students.view"], held),
    ["students.view", "z.z"],
  );
});

test("mergeSeenReleases validates, dedupes and caps", () => {
  assert.equal(mergeSeenReleases([], new Array(51).fill("a")), null);
  assert.equal(mergeSeenReleases([], "a"), null);
  assert.deepEqual(mergeSeenReleases(["r1"], ["r2", "r2", "Bad Id", 5]), ["r1", "r2"]);
  const many = Array.from({ length: 500 }, (_, i) => `r${i}`);
  const merged = mergeSeenReleases(many, ["new-one"]);
  assert.equal(merged.length, 500);
  assert.equal(merged.at(-1), "new-one");
  assert.ok(!merged.includes("r0"));
});

test("tourSummary counts the guided journey's chapters only", () => {
  assert.deepEqual(tourSummary({}), { intro: "none", done: 0, skipped: 0 });
  assert.deepEqual(
    tourSummary({
      welcome: { status: "done" },
      students: { status: "done" },
      "journey-intro": { status: "skipped" },
      "journey-students": { status: "done" },
      "journey-lessons": { status: "done" },
      "journey-files": { status: "skipped" },
    }),
    { intro: "skipped", done: 2, skipped: 2 },
  );
  assert.deepEqual(tourSummary({ "journey-intro": { status: "done" } }), { intro: "done", done: 1, skipped: 0 });
});

test("applyTour stores the update and enforces the cap", () => {
  const next = applyTour({}, { id: "students", status: "done", version: 2 });
  assert.equal(next.students.status, "done");
  assert.equal(next.students.version, 2);
  assert.ok(next.students.at instanceof Date);

  const full = {};
  for (let i = 0; i < MAX_TOURS; i++) full[`t${i}`] = { status: "done", version: 1 };
  assert.equal(applyTour(full, { id: "extra", status: "done", version: 1 }), null);
  const overwritten = applyTour(full, { id: "t0", status: "skipped", version: 3 });
  assert.equal(overwritten.t0.status, "skipped");
  assert.equal(Object.keys(overwritten).length, MAX_TOURS);
});

test("applyTour does not touch the prototype", () => {
  const next = applyTour({}, { id: "students", status: "done", version: 1 });
  assert.equal(Object.getPrototypeOf(next), null);
  assert.equal(({}).students, undefined);
});
