const assert = require("node:assert/strict");
const test = require("node:test");

const { createActorCache } = require("../services/actorCache");

const user = (tz, extra = {}) => ({ _id: `id-${tz}`, tz, roles: ["مرشد"], permissionGrants: [], ...extra });

function setup(users) {
  const clock = { now: 1_000 };
  const reads = [];
  const cache = createActorCache({
    load: async (tz) => { reads.push(tz); await new Promise((r) => setImmediate(r)); return users[tz] ? { ...users[tz] } : null; },
    now: () => clock.now,
  });
  return { cache, clock, reads };
}

test("requests that arrive together share one read; within 5 s no new read", async () => {
  const { cache, clock, reads } = setup({ t1: user("t1") });
  const all = await Promise.all(Array.from({ length: 13 }, () => cache.get("t1")));
  assert.equal(reads.length, 1, "13 parallel requests, one database read");
  assert.ok(all.every((u) => u.tz === "t1"));
  clock.now += 4_999;
  await cache.get("t1");
  assert.equal(reads.length, 1);
  clock.now += 2;
  await cache.get("t1");
  assert.equal(reads.length, 2, "after 5 s the user is read again");
});

test("clear() (any user write) makes the next request read the database", async () => {
  const users = { t1: user("t1", { permissionGrants: ["students.view"] }) };
  const { cache, reads } = setup(users);
  await cache.get("t1");
  users.t1 = user("t1", { permissionGrants: [], lockedAt: new Date() });
  cache.clear();
  const fresh = await cache.get("t1");
  assert.equal(reads.length, 2);
  assert.deepEqual(fresh.permissionGrants, []);
  assert.ok(fresh.lockedAt);
});

test("a write during the read does not leave the old user cached", async () => {
  const users = { t1: user("t1", { name: "old" }) };
  const { cache, reads } = setup(users);
  const pending = cache.get("t1");
  cache.clear(); // a write while the read was on its way
  await pending;
  users.t1 = user("t1", { name: "new" });
  assert.equal((await cache.get("t1")).name, "new");
  assert.equal(reads.length, 2);
});

test("a missing user is not cached; a failed read is not cached", async () => {
  const users = {};
  const { cache, reads } = setup(users);
  assert.equal(await cache.get("t9"), null);
  users.t9 = user("t9");
  assert.equal((await cache.get("t9")).tz, "t9", "an approved user is found at once");
  assert.equal(reads.length, 2);

  let fail = true;
  const flaky = createActorCache({ load: async () => { if (fail) throw new Error("db"); return user("t2"); } });
  await assert.rejects(flaky.get("t2"));
  fail = false;
  assert.equal((await flaky.get("t2")).tz, "t2");
});

test("each request gets its own copy: changing it never changes the cache", async () => {
  const { cache } = setup({ t1: user("t1", { roles: ["مرشد"] }) });
  const first = await cache.get("t1");
  first.roles.push("ادارة");
  first.firstname = "changed";
  const second = await cache.get("t1");
  assert.deepEqual(second.roles, ["مرشد"]);
  assert.equal(second.firstname, undefined);
});

test("every write through UserModelDef empties the shared cache (edits, lockout, password, moves)", async () => {
  const path = require("node:path");
  const apiPath = require.resolve(path.join(__dirname, "../Entities/api"));
  const modelPath = require.resolve(path.join(__dirname, "../Entities/User/User.model"));
  const saved = require.cache[apiPath];
  const savedKey = process.env.PASSWORD_ENC_KEY_HEX;
  process.env.PASSWORD_ENC_KEY_HEX = savedKey || "ab".repeat(32); // a test key, never a real one
  delete require.cache[modelPath];
  const ok = async () => ({ success: true, result: null });
  require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: { read: ok, create: ok, update: ok, updateExisting: ok, increment: ok, delete: ok } };
  try {
    const { UserModelDef } = require(modelPath);
    const { sharedCache } = require("../services/actorCache");
    let reads = 0;
    const cache = sharedCache(async (tz) => { reads += 1; return { tz }; });
    const writes = [
      () => UserModelDef.update({ tz: "t1" }, { firstname: "x" }),
      () => UserModelDef.updateExisting({ tz: "t1" }, { permissionGrants: [] }),
      () => UserModelDef.create({ tz: "t2" }),
      () => UserModelDef.incrementFailedLogin("t1"),
      () => UserModelDef.lockIfThresholdReached("t1", new Date(), 5),
      () => UserModelDef.delete({ tz: "t1" }),
    ];
    await cache.get("t1");
    for (const write of writes) {
      const before = reads;
      await cache.get("t1");
      assert.equal(reads, before, "cached between two requests");
      await write();
      await cache.get("t1");
      assert.equal(reads, before + 1, `${write} empties the cache`);
    }
  } finally {
    delete require.cache[modelPath];
    if (saved) require.cache[apiPath] = saved; else delete require.cache[apiPath];
    if (savedKey === undefined) delete process.env.PASSWORD_ENC_KEY_HEX; else process.env.PASSWORD_ENC_KEY_HEX = savedKey;
  }
});
