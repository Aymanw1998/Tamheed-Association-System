const assert = require("node:assert/strict");
const test = require("node:test");
const { matches } = require("./helpers/memoryModel");
const { createSportPeople, isUserPlayer, NO_STATS, PLACEHOLDER_EMAIL } = require("../utils/sportPeople");

// Users as sport players (owner, 2026-11-09). Synthetic ids and names only.
const S1 = "a".repeat(24);
const U1 = "b".repeat(24);
const U2 = "c".repeat(24);
const IT_ONLY = "d".repeat(24); // an IT account without an everyday role: hidden

// An in-memory model with get and updateExisting (null when nothing matched).
function store(docs) {
  const list = docs.map((d) => ({ ...d }));
  return {
    list,
    writes: [],
    async get(filter = {}) {
      return { success: true, result: list.filter((d) => matches(d, filter)).map((d) => ({ ...d })) };
    },
    async updateExisting(filter, data) {
      this.writes.push({ filter, data });
      const doc = list.find((d) => matches(d, filter));
      if (!doc) return { success: true, result: null };
      Object.assign(doc, data);
      return { success: true, result: { ...doc } };
    },
  };
}

const world = () => {
  const students = store([{ _id: S1, tz: "900000101", firstname: "طالب", lastname: "أ", email: "s@example.test" }]);
  const users = store([
    { _id: U1, tz: "900000102", firstname: "موظف", lastname: "ب", role: "مرشد", email: PLACEHOLDER_EMAIL },
    { _id: U2, tz: "900000103", firstname: "موظفة", lastname: "ج", role: "مساعد", email: "u2@example.test" },
    { _id: IT_ONLY, tz: "900000104", firstname: "تقني", lastname: "", isIT: true },
  ]);
  return { students, users, people: createSportPeople({ students, users }) };
};

test("get returns students first, then users tagged as kind user", async () => {
  const { people } = world();
  const res = await people.get({});
  assert.equal(res.success, true);
  assert.deepEqual(res.result.map((p) => [String(p._id), p.kind || "student"]), [[S1, "student"], [U1, "user"], [U2, "user"]]);
});

test("a hidden (IT-only) user is never returned", async () => {
  const { people } = world();
  assert.deepEqual((await people.get({ _id: IT_ONLY })).result, []);
});

test("the user model's placeholder email reads as no email", async () => {
  const { people } = world();
  assert.equal((await people.get({ _id: U1 })).result[0].email, "");
  assert.equal((await people.get({ _id: U2 })).result[0].email, "u2@example.test");
});

test("updateExisting writes the student when one matches, else the user", async () => {
  const { people, students, users } = world();
  await people.updateExisting({ _id: S1 }, { sportCardHash: "h1" });
  assert.equal(students.list[0].sportCardHash, "h1");
  assert.equal(users.writes.length, 0);
  const res = await people.updateExisting({ _id: U2 }, { sportCardHash: "h2" });
  assert.equal(users.list[1].sportCardHash, "h2");
  assert.equal(res.result.kind, "user");
});

test("updateExisting never writes a hidden user", async () => {
  const { people, users } = world();
  const res = await people.updateExisting({ _id: IT_ONLY }, { sportCardHash: "x" });
  assert.equal(res.result, null);
  assert.equal(users.list[2].sportCardHash, undefined);
});

test("findPerson answers a student, a user, or null for unknown, hidden or bad ids", async () => {
  const { people } = world();
  assert.equal((await people.findPerson(S1)).firstname, "طالب");
  assert.equal((await people.findPerson(U2)).kind, "user");
  assert.equal(await people.findPerson(IT_ONLY), null);
  assert.equal(await people.findPerson("e".repeat(24)), null);
  assert.equal(await people.findPerson({ $ne: null }), null);
  assert.equal(await people.findPerson("not-an-id"), null);
});

test("peopleMap maps every visible student and user by id", async () => {
  const { people } = world();
  const map = await people.peopleMap();
  assert.deepEqual([...map.keys()], [S1, U1, U2]);
  assert.equal(map.get(U1).kind, "user");
});

test("isUserPlayer and the NO_STATS answer", () => {
  assert.equal(isUserPlayer({ kind: "user" }), true);
  assert.equal(isUserPlayer({ kind: "student" }), false);
  assert.equal(isUserPlayer({}), false);
  assert.equal(NO_STATS.code, "NO_STATS_FOR_STAFF");
  assert.equal(NO_STATS.ok, false);
});
