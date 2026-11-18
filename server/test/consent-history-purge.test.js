// Owner, 2026-11-15: earlier parent signatures are no longer kept, and the
// copies kept before then are deleted for good at server start.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModel(api) {
  const filename = path.join(__dirname, "../Entities/InviteToken/Rules.model.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, process,
    require(name) {
      if (name === "../api") return api;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  return module.exports;
}

test("purgeConsentHistory deletes every stored earlier signature and only that collection", async () => {
  const calls = [];
  let stored = 3;
  const model = loadModel({ async delete(args) { calls.push(args); const n = stored; stored = 0; return { success: true, result: { deletedCount: n } }; } });
  assert.equal(await model.purgeConsentHistory(), 3);
  assert.equal(await model.purgeConsentHistory(), 0, "a second run finds nothing");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].collection, "StudentConsentHistory");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].filter)), {});
  assert.equal(model.ConsentHistoryModelDef, undefined, "nothing writes earlier signatures any more");
});
