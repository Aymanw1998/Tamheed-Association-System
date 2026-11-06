const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function load({ failIndex = false } = {}) {
  const writes = [];
  const indexes = [];
  const api = {
    create: async (args) => { writes.push(args); return { result: { _id: "receipt", ...args.data } }; },
    read: async () => ({ result: [{ _id: "existing" }] }),
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../Entities/WeeklyTask/WeeklyTask.model"), "utf8"), {
    module, process: { env: {} }, require: (name) => {
      if (name === "../api") return api;
      assert.equal(name, "../../utils/ensureIndexes");
      return { collectionOf: (model) => model.collection, ensureIndexes: async (collection, spec) => {
        if (failIndex) throw new Error("index unavailable");
        indexes.push({ collection, spec });
      } };
    },
  });
  return { model: module.exports.TaskGreetingModelDef, api, indexes, writes };
}
test("greeting receipts require unique indexes before writing, cached across calls", async () => {
  const ctx = load();
  await ctx.model.createOnce({ requestId: "one" }, { requestId: "one" });
  await ctx.model.createOnce({ requestId: "two" }, { requestId: "two" });
  assert.equal(ctx.indexes.length, 4);
  assert.equal(ctx.indexes.find((item) => item.collection === "WeeklyTaskGreetings").spec[0].options.unique, true);
  assert.equal(ctx.writes.length, 2);
});
test("an unavailable unique index prevents a receipt/send claim", async () => {
  const ctx = load({ failIndex: true });
  await assert.rejects(ctx.model.createOnce({}, {}), /index unavailable/);
  assert.equal(ctx.writes.length, 0);
});
test("duplicate receipt claims return the existing delivery instead of claiming a second send", async () => {
  const ctx = load();
  ctx.api.create = async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); };
  const result = await ctx.model.createOnce({ requestId: "one" }, { requestId: "one" });
  assert.equal(result.created, false);
  assert.equal(result.result._id, "existing");
});
