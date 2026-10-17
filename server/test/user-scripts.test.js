const assert = require("node:assert/strict");
const test = require("node:test");

const { unlockUser } = require("../scripts/unlockUser");
const { isPlainStoredPassword, encryptPlainPasswords } = require("../scripts/encryptPlainPasswords");

function stubModel(rooms) {
  const updates = [];
  return {
    updates,
    async get(filter, room) {
      const all = rooms[room] || [];
      const result = filter.tz === undefined ? all : all.filter((u) => u.tz === filter.tz);
      return { success: true, result };
    },
    async update(filter, data, room) { updates.push([filter, data, room]); return { success: true }; },
  };
}

test("unlockUser clears counter and lock in the room where the user lives", async () => {
  const model = stubModel({ noActive: [{ tz: "7", failedLoginCount: 5, lockedAt: new Date() }] });
  const result = await unlockUser("7", model);
  assert.deepEqual(result, { found: true, room: "noActive" });
  assert.deepEqual(model.updates, [[{ tz: "7" }, { failedLoginCount: 0, lockedAt: null }, "noActive"]]);
});

test("unlockUser reports not found and writes nothing", async () => {
  const model = stubModel({});
  assert.deepEqual(await unlockUser("7", model), { found: false });
  assert.deepEqual(await unlockUser("", model), { found: false });
  assert.equal(model.updates.length, 0);
});

test("isPlainStoredPassword spots only values that are neither bcrypt nor enc", () => {
  const bcryptLike = "$2a$10$" + "a".repeat(53);
  assert.equal(isPlainStoredPassword("some-plain"), true);
  assert.equal(isPlainStoredPassword(bcryptLike), false);
  assert.equal(isPlainStoredPassword("enc.aaa.bbb.ccc"), false);
  assert.equal(isPlainStoredPassword(""), false);
  assert.equal(isPlainStoredPassword(null), false);
});

const rooms = () => ({
  active: [{ tz: "1", password: "plain-a" }, { tz: "2", password: "enc.a.b.c" }],
  waiting: [{ tz: "3", password: "plain-b" }],
  noActive: [],
});

test("encryptPlainPasswords dry run only counts", async () => {
  const model = stubModel(rooms());
  const counts = await encryptPlainPasswords({ model });
  assert.deepEqual(counts, {
    active: { found: 1, updated: 0 },
    waiting: { found: 1, updated: 0 },
    noActive: { found: 0, updated: 0 },
  });
  assert.equal(model.updates.length, 0);
});

test("encryptPlainPasswords --apply re-saves each plain password through the model", async () => {
  const model = stubModel(rooms());
  const counts = await encryptPlainPasswords({ model, apply: true });
  assert.equal(counts.active.updated, 1);
  assert.equal(counts.waiting.updated, 1);
  assert.deepEqual(model.updates, [
    [{ tz: "1" }, { password: "plain-a" }, "active"],
    [{ tz: "3" }, { password: "plain-b" }, "waiting"],
  ]);
});
