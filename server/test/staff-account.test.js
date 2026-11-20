// The staff account made for a student who becomes staff (owner, 2026-11-19;
// testing review 2026-11-20): createUserFromStudent and
// copyStudentPhotoToUser in User.controller. Synthetic data only.
const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { auditStub } = require("./helpers/auditStub");

const STUDENT_TZ = "000000018"; // checksum-valid, synthetic
const USER_ID = "d".repeat(24);
const STUDENT_ID = "5".repeat(24);

function createUsers(seed = {}) {
  const rooms = { active: [], waiting: [], noActive: [], ...structuredClone(seed) };
  const matches = (doc, filter) => Object.keys(filter).every((k) => {
    const want = filter[k];
    if (want && typeof want === "object" && "$regex" in want) return new RegExp(want.$regex).test(String(doc[k] ?? ""));
    return want == null ? doc[k] == null : String(doc[k]) === String(want);
  });
  return {
    dbName: "tamheed_db",
    collections: { active: "Users" },
    duplicateOnCreate: false,
    async get(filter = {}, room = "active") {
      return { success: true, result: rooms[room].filter((d) => matches(d, filter)).map((d) => structuredClone(d)) };
    },
    async create(data, room = "active") {
      if (this.duplicateOnCreate) { const e = new Error("dup"); e.code = 11000; throw e; }
      rooms[room].push(structuredClone(data));
      return { success: true, result: structuredClone(data) };
    },
    async updateExisting(filter, data, room = "active") {
      const hit = rooms[room].find((d) => matches(d, filter));
      if (hit) Object.assign(hit, structuredClone(data));
      return { success: true, result: hit ? structuredClone(hit) : null };
    },
    rooms,
  };
}

function load(users, { drive, upload } = {}) {
  const audit = auditStub();
  const dependencies = {
    bcryptjs: {}, jsonwebtoken: {}, path,
    "./User.model": { UserModelDef: users },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    "../../utils/tourState": require("../utils/tourState"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
    "../../utils/systemPassword": require("../utils/systemPassword"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {
      encryptPassword: (v) => `enc:${v}`, decryptPassword: (v) => String(v).replace(/^enc:/, ""),
      isEncrypted: (v) => typeof v === "string" && v.startsWith("enc:"), safeEqual: (a, b) => a === b,
    },
    "../UploadFile/file": { handleUpload: upload || (async () => null) },
    "../Storage/Storage.controller": {
      buildUserStorageFolder: (u = {}) => u.storageFolder || `users/${u.tz}`,
      ensureUserStorageFolder: async () => {}, syncStorageViewPermissionsForUser: async () => {},
    },
    "../Notification/Notification.controller": {},
    "../../services/googleDrive.service": drive || {},
    ...require("./helpers/alertEventsStub").noopAlertDeps,
    ...audit.deps,
    ...require("./helpers/recycleBinStub").recycleBinStub().deps,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, process, Buffer, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const student = (extra = {}) => ({ _id: STUDENT_ID, tz: STUDENT_TZ, firstname: "علي", lastname: "طالب", phone: "0500000000", ...extra });
const conv = { userId: USER_ID, role: "مساعد" };
const body = { password: "Secret-123", phone: "0501111111", tz: "999999998", email: "" };

test("the account takes the student's own tz and the chosen role, and must change its password", async () => {
  const users = createUsers();
  const out = await load(users).createUserFromStudent({ student: student(), conv, body, req: {} });
  assert.deepEqual(JSON.parse(JSON.stringify(out)), {});
  const [made] = users.rooms.active;
  assert.equal(made._id, USER_ID, "the id chosen in the prepared phase");
  assert.equal(made.tz, STUDENT_TZ, "a tz in the body is ignored");
  assert.equal(made.role, "مساعد");
  assert.deepEqual(JSON.parse(JSON.stringify(made.roles)), ["مساعد"]);
  assert.equal(made.mustChangePassword, true);
  assert.equal(made.fromStudentId, STUDENT_ID);
  assert.equal(made.phone, "0501111111");
  assert.ok(!("email" in made), "an empty email is left out");
});

test("a tz held by other staff, or an invalid tz, is refused and clears the conversion", async () => {
  const taken = createUsers({ noActive: [{ _id: "other", tz: STUDENT_TZ }] });
  const refused = await load(taken).createUserFromStudent({ student: student(), conv, body, req: {} });
  assert.equal(refused.status, 409);
  assert.equal(refused.clear, true);
  assert.equal(refused.body.code, "TZ_EXISTS");
  assert.equal(taken.rooms.active.length, 0);

  const bad = await load(createUsers()).createUserFromStudent({ student: student({ tz: "123" }), conv, body, req: {} });
  assert.equal(bad.status, 400);
  assert.equal(bad.clear, true);
  assert.equal(bad.body.code, "INVALID_TZ");
});

test("the same account already made (any room) counts as made: no second account", async () => {
  const users = createUsers({ waiting: [{ _id: USER_ID, tz: STUDENT_TZ, fromStudentId: STUDENT_ID }] });
  const out = await load(users).createUserFromStudent({ student: student(), conv, body, req: {} });
  assert.deepEqual(JSON.parse(JSON.stringify(out)), {});
  assert.equal(users.rooms.active.length, 0);
});

test("a duplicate key: the same student's account is fine, anyone else's is TZ_EXISTS", async () => {
  const users = createUsers();
  users.duplicateOnCreate = true;
  const refused = await load(users).createUserFromStudent({ student: student(), conv, body, req: {} });
  assert.equal(refused.body.code, "TZ_EXISTS");
  users.rooms.active.push({ _id: USER_ID, tz: STUDENT_TZ, fromStudentId: STUDENT_ID });
  const fine = await load(users).createUserFromStudent({ student: student(), conv, body, req: {} });
  assert.deepEqual(JSON.parse(JSON.stringify(fine)), {});
});

test("the photo is copied to a new file, under the model's database name, even when DB_NAME is unset", async () => {
  const users = createUsers({ active: [{ _id: USER_ID, tz: STUDENT_TZ }] });
  const before = process.env.DB_NAME;
  delete process.env.DB_NAME;
  const uploads = [];
  const drive = {
    extractFileId: () => "file-1",
    async downloadStream() { return (async function* () { yield Buffer.from("img"); })(); },
    async getFileInfo() { return { name: "p.jpg", mimeType: "image/jpeg" }; },
  };
  const upload = async (file, dbName, collection, tz) => { uploads.push({ dbName, collection, tz }); return { secure_url: "https://drive/new-file" }; };
  try {
    await load(users, { drive, upload }).copyStudentPhotoToUser({ student: student({ photo: "https://drive/old-file" }), userId: USER_ID });
  } finally {
    if (before !== undefined) process.env.DB_NAME = before;
  }
  assert.deepEqual(uploads, [{ dbName: "tamheed_db", collection: "Users", tz: STUDENT_TZ }]);
  assert.equal(users.rooms.active[0].photo, "https://drive/new-file", "his own file, not the student's");
});
