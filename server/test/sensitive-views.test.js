// «سجل الاطلاع» (owner, 2026-11-16): a look at a student's health, the
// parents' phones or the signature is written once per 10 minutes per person,
// without the details, and kept one year.
const assert = require("node:assert/strict");
const test = require("node:test");

const { createSensitiveViews, sensitiveFieldsOf, KEEP_DAYS, TTL_INDEX, REPEAT_MS } = require("../utils/sensitiveViews");

const actor = { tz: "111111118", name: "Ad Min" };

test("only filled sensitive fields count", () => {
  assert.deepEqual(sensitiveFieldsOf({ health_status: "asthma", father_phone: "", mother_phone: "050", phone: "052" }), ["health_status", "mother_phone"]);
  assert.deepEqual(sensitiveFieldsOf({ health_status: "  " }), []);
});

test("a look is written once per 10 minutes per person, student and fields, without the details", async () => {
  const rows = [];
  let clock = new Date("2026-11-16T10:00:00Z");
  const views = createSensitiveViews({ create: async (data) => rows.push(data), now: () => clock });
  const req = { actor };
  assert.equal(await views.record(req, { studentId: "s1", studentLabel: "Example Student", fields: ["health_status"] }), true);
  assert.equal(await views.record(req, { studentId: "s1", studentLabel: "Example Student", fields: ["health_status"] }), false);
  assert.equal(await views.record(req, { studentId: "s1", fields: ["signature"] }), true, "another kind of detail is its own look");
  assert.equal(await views.record({ actor: { tz: "222222226", name: "B" } }, { studentId: "s1", fields: ["health_status"] }), true);
  clock = new Date(clock.getTime() + REPEAT_MS + 1);
  assert.equal(await views.record(req, { studentId: "s1", fields: ["health_status"] }), true);
  assert.equal(rows.length, 4);
  assert.deepEqual({ ...rows[0], at: undefined }, { at: undefined, actor: "111111118", actorName: "Ad Min", studentId: "s1", studentLabel: "Example Student", fields: ["health_status"] });
});

test("nothing to record, or a failed write, never throws", async () => {
  const views = createSensitiveViews({ create: async () => { throw new Error("db down"); }, log: () => {} });
  assert.equal(await views.record({ actor }, { studentId: "s1", fields: [] }), false);
  assert.equal(await views.record({}, { studentId: "s1", fields: ["health_status"] }), false);
  assert.equal(await views.record({ actor }, { studentId: "s1", fields: ["health_status"] }), false);
});

test("kept one year by a TTL index on at", () => {
  assert.equal(KEEP_DAYS, 365);
  assert.deepEqual(TTL_INDEX.key, { at: 1 });
  assert.equal(TTL_INDEX.options.expireAfterSeconds, 365 * 24 * 60 * 60);
});

test("the IT list is newest first, 50 a page, optionally for one student", async () => {
  let asked;
  const views = createSensitiveViews({ readPage: async (args) => { asked = args; return { result: [{ _id: "v1" }], total: 51 }; } });
  const out = await views.page({ page: 2, studentId: "s1" });
  assert.deepEqual(asked.filter, { studentId: "s1" });
  assert.deepEqual(asked.sort, { at: -1, _id: -1 });
  assert.equal(asked.skip, 50);
  assert.equal(out.total, 51);
});
