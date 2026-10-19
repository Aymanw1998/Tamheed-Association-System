const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");

// api.readPage against a fake mongoose model (no database).
test("readPage filters, sorts, skips, limits and counts", async () => {
  const calls = {};
  const docs = [{ _id: "a", n: 1 }];
  const FakeModel = {
    find(filter) {
      calls.filter = filter;
      const q = {
        sort(s) { calls.sort = s; return q; },
        skip(n) { calls.skip = n; return q; },
        limit(n) { calls.limit = n; return q; },
        lean: async () => docs,
      };
      return q;
    },
    countDocuments: async (filter) => { calls.countFilter = filter; return 120; },
  };
  const fakeMongoose = {
    Schema: function Schema() {},
    connection: { readyState: 1, useDb: () => ({ model: () => FakeModel }) },
  };
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "mongoose") return fakeMongoose;
    return origLoad.call(this, request, ...rest);
  };
  let api;
  try {
    delete require.cache[require.resolve("../Entities/api")];
    api = require("../Entities/api");
  } finally {
    Module._load = origLoad;
  }
  const out = await api.readPage({ dbName: "d", collection: "c", filter: { x: 1 }, sort: { at: -1 }, skip: 100, limit: 50 });
  assert.deepEqual(calls, { filter: { x: 1 }, sort: { at: -1 }, skip: 100, limit: 50, countFilter: { x: 1 } });
  assert.deepEqual(out, { success: true, result: [{ _id: "a", n: 1 }], total: 120 });
  delete require.cache[require.resolve("../Entities/api")];
});
