const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function load({ failIndex = false } = {}) {
  const writes = [], indexes = [];
  const module = { exports: {} };
  const api = { create: async (args) => { writes.push(args); return { success: true }; } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../Entities/InviteToken/Rules.model"), "utf8"), {
    module, process: { env: {} }, require(name) {
      if (name === "../api") return api;
      assert.equal(name, "../../utils/ensureIndexes");
      return { collectionOf: (model) => model.collection, ensureIndexes: async (collection, specs) => {
        if (failIndex) throw new Error("index unavailable");
        indexes.push({ collection, specs });
      } };
    },
  });
  return { model: module.exports.ConsentModelDef, indexes, writes };
}
test("consent creation requires and caches the unique student index", async () => {
  const ctx = load();
  await ctx.model.create({ studentId: "one" }); await ctx.model.create({ studentId: "two" });
  assert.equal(ctx.indexes.length, 1);
  assert.equal(ctx.indexes[0].collection, "StudentConsents");
  assert.equal(ctx.indexes[0].specs[0].key.studentId, 1);
  assert.equal(ctx.indexes[0].specs[0].options.unique, true);
  assert.equal(ctx.writes.length, 2);
});
test("index failure prevents accepting a consent without concurrency protection", async () => {
  const ctx = load({ failIndex: true });
  await assert.rejects(ctx.model.create({ studentId: "one" }), /index unavailable/);
  assert.equal(ctx.writes.length, 0);
});
