// Loads Storage.controller.js in a vm with in-memory stand-ins for the central
// storage server, the database and the live bus. Shared by the storage tests.
//   const { controller, storage, audit, calls, published } = loadStorageController(seed, { extraUsers });
//   published -> [{ tzs, type, payload }] for every liveBus.publishToMany call
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { auditStub } = require("./auditStub");

function createStore(seed = []) {
  let docs = seed.map((d, i) => ({ _id: `meta-${i}`, ...d }));
  let next = docs.length;
  const matches = (doc, filter = {}) => Object.keys(filter).every((k) => (filter[k] == null ? doc[k] == null : String(doc[k]) === String(filter[k])));
  return {
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
    async create(data) { const doc = { _id: `meta-${next++}`, ...structuredClone(data) }; docs.push(doc); return { success: true, result: doc }; },
    async update(filter, patch) { docs = docs.map((d) => (matches(d, filter) ? { ...d, ...structuredClone(patch) } : d)); return { success: true }; },
    async delete(filter) { docs = docs.filter((d) => !matches(d, filter)); return { success: true }; },
    all: () => docs,
  };
}

const ADMIN = { _id: "a".repeat(24), tz: "100000009", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const OTHER = { _id: "b".repeat(24), tz: "200000008", firstname: "Oth", lastname: "Er", roles: ["مرشد"] };

function loadStorageController(seed = [], { users: baseUsers = [ADMIN, OTHER], extraUsers = [] } = {}) {
  const published = [];
  const storage = createStore(seed);
  const all = [...baseUsers, ...extraUsers];
  const users = {
    async get(filter = {}) {
      return { success: true, result: all.filter((u) => !filter.tz || u.tz === filter.tz).filter((u) => !filter._id || u._id === filter._id) };
    },
    async update() { return { success: true }; },
  };
  const calls = [];
  const axios = {
    async post(url, body) { calls.push(["post", url, body]); return { data: { success: true, filename: body?.fileName, relativePath: "" } }; },
    async patch(url, body) { calls.push(["patch", url, body]); return { data: { success: true, name: body.newName } }; },
    async delete(url, options) { calls.push(["delete", url, options]); return { data: { success: true, deleted: true } }; },
  };
  const audit = auditStub();
  const liveBus = {
    async publish(tz, type, payload) { published.push({ tzs: [tz], type, payload: JSON.parse(JSON.stringify(payload)) }); },
    async publishToMany(tzs, type, payload) {
      published.push({ tzs: JSON.parse(JSON.stringify(tzs)), type, payload: JSON.parse(JSON.stringify(payload)) });
    },
  };
  const dependencies = {
    axios,
    "form-data": function FormData() {},
    fs: { mkdirSync() {}, promises: { readFile: async () => { throw Object.assign(new Error("none"), { code: "ENOENT" }); }, mkdir: async () => {}, writeFile: async () => {}, unlink: async () => {}, readdir: async () => [], stat: async () => ({}) } },
    jsonwebtoken: { sign: () => "token", verify: () => ({}) },
    path,
    "../User/User.model": { UserModelDef: users },
    "./Storage.model": { StorageModelDef: storage },
    "../../services/liveBus": liveBus,
    "../../services/storageRecipients": require("../../services/storageRecipients"),
    "../../utils/textEncoding": require("../../utils/textEncoding"),
    "../../utils/permissions": require("../../utils/permissions"),
    "../../utils/permissionRules": require("../../utils/permissionRules"),
    "../../utils/israeliId": require("../../utils/israeliId"),
    ...audit.deps,
  };
  const filename = path.join(__dirname, "../../Entities/Storage/Storage.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, URL, Date, Buffer, setTimeout, setInterval: () => ({ unref() {} }),
    process: { env: {}, cwd: () => __dirname },
    console: { log() {}, info() {}, warn() {}, error() {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, storage, audit, calls, published };
}

module.exports = { loadStorageController, createStore, ADMIN, OTHER };
