// AiConversations: per-owner storage of assistant chats (messages appended,
// never edited), listed without their messages, hard-deleted by the owner,
// removed after 90 days unused.
const assert = require("node:assert/strict");
const test = require("node:test");

const { createConversationModel, CONVERSATION_INDEXES, UNUSED_DAYS, staleCutoff, LOCK_MS } =
  require("../Entities/AiConversation/AiConversation.model");

function fakeApi() {
  const calls = [];
  const rec = (name) => async (args) => { calls.push([name, args]); return { success: true, result: name === "readPage" ? [] : null, total: 0 }; };
  return { calls, create: rec("create"), read: rec("read"), readPage: rec("readPage"), push: rec("push"),
    updateExisting: rec("updateExisting"), delete: async (args) => { calls.push(["delete", args]); return { result: { deletedCount: 3 } }; } };
}

test("staleCutoff is 90 days before now", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  assert.equal(UNUSED_DAYS, 90);
  assert.equal(now - staleCutoff(now), 90 * 24 * 60 * 60 * 1000);
});

test("every query is scoped to the owner", async () => {
  const api = fakeApi();
  const model = createConversationModel(api);
  await model.listFor("owner-1");
  await model.findOwn("owner-1", "a".repeat(24));
  await model.append("owner-1", "a".repeat(24), [{ role: "user", content: "hi" }]);
  await model.rename("owner-1", "a".repeat(24), "t");
  await model.remove("owner-1", "a".repeat(24));
  for (const [name, args] of api.calls) assert.equal(args.filter.ownerTz, "owner-1", name);
  const list = api.calls.find(([n]) => n === "readPage")[1];
  assert.deepEqual(list.projection, { messages: 0 }, "the list never loads messages");
  assert.deepEqual(list.sort, { updatedAt: -1 });
});

test("append pushes messages and touches updatedAt; it never rewrites earlier ones", async () => {
  const api = fakeApi();
  const at = new Date("2026-10-20T10:00:00Z");
  await createConversationModel(api).append("o", "b".repeat(24), [{ role: "user", content: "x" }], at);
  const [, args] = api.calls.find(([n]) => n === "push");
  assert.equal(args.field, "messages");
  assert.deepEqual(args.items, [{ role: "user", content: "x" }]);
  assert.deepEqual(args.set, { updatedAt: at });
});

test("create stores owner, title, empty messages and dates", async () => {
  const api = fakeApi();
  const at = new Date("2026-10-20T10:00:00Z");
  await createConversationModel(api).create("o", "  hello  ", at);
  const [, args] = api.calls.find(([n]) => n === "create");
  assert.equal(args.collection, "AiConversations");
  assert.deepEqual(args.data, { ownerTz: "o", title: "hello", messages: [], createdAt: at, updatedAt: at });
});

test("deleteUnusedBefore removes conversations not updated since the cutoff", async () => {
  const api = fakeApi();
  const cutoff = new Date("2026-07-22T00:00:00Z");
  assert.equal(await createConversationModel(api).deleteUnusedBefore(cutoff), 3);
  const [, args] = api.calls.find(([n]) => n === "delete");
  assert.deepEqual(args.filter, { updatedAt: { $lt: cutoff } });
});

test("a bad id never reaches the database", async () => {
  const api = fakeApi();
  const model = createConversationModel(api);
  assert.equal(await model.findOwn("o", "nope"), null);
  assert.equal(await model.remove("o", "nope"), 0);
  assert.equal(api.calls.length, 0);
});

test("indexes: owner list by updatedAt, and updatedAt for the cleanup", () => {
  assert.deepEqual(CONVERSATION_INDEXES.map((i) => i.key), [{ ownerTz: 1, updatedAt: -1 }, { updatedAt: 1 }]);
  const server = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /ensureConversationIndexes\(\)/);
});

test("lock: a conditional write on the owner's conversation, free or expired only, longer than the worst-case turn", async () => {
  const api = fakeApi();
  const at = new Date("2026-10-20T10:00:00Z");
  api.updateExisting = async (args) => { api.calls.push(["updateExisting", args]); return { result: { _id: "x" } }; };
  const model = createConversationModel(api);
  const token = await model.lock("o", "c".repeat(24), at);
  const [, args] = api.calls.at(-1);
  assert.deepEqual(args.filter, { _id: "c".repeat(24), ownerTz: "o", $or: [{ busyUntil: null }, { busyUntil: { $lte: at } }] });
  assert.deepEqual(args.newData, { busyUntil: new Date(at.getTime() + LOCK_MS) });
  // 8 rounds x (1 try + 1 retry) x 120 s client timeout = 32 minutes.
  const { MAX_ROUNDS } = require("../services/ai.service");
  assert.ok(LOCK_MS > MAX_ROUNDS * 2 * 120 * 1000, "the lock outlives the worst-case turn");
  assert.equal(LOCK_MS, 35 * 60 * 1000);
  assert.deepEqual(token, new Date(at.getTime() + LOCK_MS));

  await model.unlock("o", "c".repeat(24), token);
  const [, release] = api.calls.at(-1);
  assert.deepEqual(release.filter, { _id: "c".repeat(24), ownerTz: "o", busyUntil: token }, "only the holder's lock is released");
  assert.deepEqual(release.newData, { busyUntil: null });
});

test("lock: held by another turn (no match) gives null; a bad id never reaches the database", async () => {
  const api = fakeApi();
  const model = createConversationModel(api);
  assert.equal(await model.lock("o", "c".repeat(24), new Date()), null);
  const before = api.calls.length;
  assert.equal(await model.lock("o", "nope", new Date()), null);
  assert.equal(await model.unlock("o", "nope", new Date()), null);
  assert.equal(api.calls.length, before);
});
