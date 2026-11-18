// Codex full review, 2026-11-18: every model uses one database name, and the
// server refuses to serve an empty system when the records are still in
// tamheed_db.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("fs");
const path = require("path");
const { checkDbName, DEFAULT_DB_NAME } = require("../utils/dbName");

test("no model names tamheed_db by itself", () => {
  const root = path.join(__dirname, "../Entities");
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".model.js")) files.push(p);
  });
  walk(root);
  const hardcoded = files.filter((f) => /dbName:\s*["']tamheed_db["']/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(hardcoded, []);
});

test("the default name always starts", async () => {
  assert.deepEqual(await checkDbName(async () => { throw new Error("not asked"); }, { dbName: DEFAULT_DB_NAME }), { ok: true });
});

test("another DB_NAME with the staff only in tamheed_db: refused, with how to move them", async () => {
  const counts = { tamheed_db: 12, other_db: 0 };
  const out = await checkDbName(async (name) => counts[name], { dbName: "other_db" });
  assert.equal(out.ok, false);
  assert.match(out.message, /mongorestore/);
});

test("another DB_NAME that already holds the staff, or a new empty server: starts", async () => {
  assert.equal((await checkDbName(async (n) => ({ tamheed_db: 12, other_db: 12 })[n], { dbName: "other_db" })).ok, true);
  assert.equal((await checkDbName(async () => 0, { dbName: "other_db" })).ok, true);
});
