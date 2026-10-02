const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Real controller logic, in-memory stand-ins for the database, Drive and the
// user collection, so nothing touches production services.
function createStore(seed = []) {
  let docs = seed.map((doc, index) => ({ _id: doc._id || `${index}`.padStart(24, "a"), ...doc }));
  let next = docs.length;
  const matches = (doc, filter = {}) =>
    Object.keys(filter).every((key) => String(doc[key]) === String(filter[key]));
  return {
    async get(filter = {}) {
      return { success: true, result: docs.filter((doc) => matches(doc, filter)).map((doc) => structuredClone(doc)) };
    },
    async create(data) {
      const doc = { _id: String(next++).padStart(24, "b"), ...structuredClone(data) };
      docs.push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async update(filter, patch) {
      docs = docs.map((doc) => (matches(doc, filter) ? { ...doc, ...structuredClone(patch) } : doc));
      return { success: true };
    },
    async delete(filter) { docs = docs.filter((doc) => !matches(doc, filter)); return { success: true }; },
    all: () => docs,
  };
}

const ADMIN = { _id: "1".padStart(24, "c"), tz: "111111118", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const GUIDE = { _id: "2".padStart(24, "c"), tz: "222222226", firstname: "Gui", lastname: "De", roles: ["مرشد"] };
const VIEWER = { _id: "3".padStart(24, "c"), tz: "333333334", firstname: "Vi", lastname: "Ewer", roles: ["مرشد"], vehiclePermissions: ["view"] };
const DOCS = { _id: "4".padStart(24, "c"), tz: "444444442", firstname: "Do", lastname: "Cs", roles: ["مساعد"], vehiclePermissions: ["view", "documents"] };

const lookupStub = { lookupByPlate: async (plate) => ({ available: true, found: false, reason: "stub", plate }) };

function setup({ vehicles = [] } = {}) {
  const vehicleStore = createStore(vehicles);
  const auditStore = createStore();
  const userStore = createStore([ADMIN, GUIDE, VIEWER, DOCS]);
  const uploads = [];
  const drive = {
    async uploadPrivateFile(args) {
      uploads.push(args);
      return { id: `drive-${uploads.length}`, name: args.name };
    },
    async downloadStream() {
      const { Readable } = require("node:stream");
      return Readable.from([Buffer.from("%PDF-1.4 hello")]);
    },
    translateDriveError: (err) => err,
    deleted: [],
    failOn: null,
    async deleteByIdIfExists(fid) {
      if (this.failOn === fid) throw new Error("drive down");
      this.deleted.push(fid);
    },
    async resolveFolderPath() { return { folderId: "folder-1" }; },
  };
  const dependencies = {
    "node:crypto": crypto,
    "./Vehicle.model.js": {
      VehicleModelDef: vehicleStore,
      VehicleAuditDef: auditStore,
    },
    "../User/User.model.js": { UserModelDef: userStore },
    "../../services/googleDrive.service.js": drive,
    "../../middleware/logger.js": { logWithSource() {} },
    "../../utils/textEncoding.js": require("../utils/textEncoding"),
    "../../utils/vehicleRules.js": require("../utils/vehicleRules"),
    "../../utils/vehicleFiles.js": require("../utils/vehicleFiles"),
    "../../services/vehicleLookup.service.js": lookupStub,
  };
  const filename = path.join(__dirname, "../Entities/Vehicle/Vehicle.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    process,
    Buffer,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, vehicleStore, auditStore, uploads, drive };
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    set(map) { Object.assign(this.headers, map); return this; },
    write(chunk) { this.chunks = (this.chunks || []).concat(chunk); return true; },
    end() { this.ended = true; },
    on() { return this; },
    once() { return this; },
    emit() { return true; },
  };
}

const as = (user, extra = {}) => ({ user: { id: user._id, tz: user.tz, roles: user.roles }, params: {}, query: {}, body: {}, ...extra });

async function guard(controller, permission, user) {
  const req = as(user);
  const res = createRes();
  let passed = false;
  await controller.requirePermission(permission)(req, res, () => { passed = true; });
  return { passed, res, req };
}

async function createVehicle(controller, overrides = {}) {
  const { req } = await guard(controller, "edit", ADMIN);
  const res = createRes();
  await controller.create({ ...req, body: { plate: "12-345-67", type: "vehicle", make: "Toyota", ...overrides } }, res);
  return res;
}

test("permissions are enforced on the server for every role", async () => {
  const { controller } = setup();
  assert.equal((await guard(controller, "view", ADMIN)).passed, true);
  assert.equal((await guard(controller, "archive", ADMIN)).passed, true);

  const guide = await guard(controller, "view", GUIDE);
  assert.equal(guide.passed, false);
  assert.equal(guide.res.statusCode, 403);

  assert.equal((await guard(controller, "view", VIEWER)).passed, true);
  assert.equal((await guard(controller, "edit", VIEWER)).passed, false);
  assert.equal((await guard(controller, "documents", VIEWER)).passed, false);
  assert.equal((await guard(controller, "documents", DOCS)).passed, true);
  assert.equal((await guard(controller, "archive", DOCS)).passed, false);
});

test("a signed-in token for a user that no longer exists is refused", async () => {
  const { controller } = setup();
  const req = { user: { id: "x", tz: "999999999", roles: ["ادارة"] }, params: {}, query: {}, body: {} };
  const res = createRes();
  let passed = false;
  await controller.requirePermission("view")(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test("create normalises and rejects a duplicate plate, even archived", async () => {
  const { controller, vehicleStore } = setup();
  const first = await createVehicle(controller);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.vehicle.plate, "1234567");

  const duplicate = await createVehicle(controller, { plate: " 1234567 " });
  assert.equal(duplicate.statusCode, 409);
  assert.ok(duplicate.body.errors.plate);

  // Archived vehicles still hold their plate.
  const id = first.body.vehicle._id;
  const { req } = await guard(controller, "archive", ADMIN);
  await controller.archive({ ...req, params: { id } }, createRes());
  const again = await createVehicle(controller, { plate: "12-345-67" });
  assert.equal(again.statusCode, 409);
  assert.equal(vehicleStore.all().length, 1);
});

test("a leading zero in the plate is preserved", async () => {
  const { controller } = setup();
  const res = await createVehicle(controller, { plate: "0123456" });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.vehicle.plate, "0123456");
});

test("create validates input and a missing responsible user", async () => {
  const { controller } = setup();
  const bad = await createVehicle(controller, { plate: "", type: "boat" });
  assert.equal(bad.statusCode, 400);
  assert.ok(bad.body.errors.plate && bad.body.errors.type);

  const missing = await createVehicle(controller, { plate: "7654321", responsibleId: "f".repeat(24) });
  assert.equal(missing.statusCode, 400);
  assert.ok(missing.body.errors.responsibleId);

  const ok = await createVehicle(controller, { plate: "7654321", responsibleId: GUIDE._id });
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.body.vehicle.responsibleName, "Gui De");
});

test("update records who changed what, and archive replaces delete", async () => {
  const { controller, auditStore, vehicleStore } = setup();
  const created = await createVehicle(controller, { type: "trailer" });
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "edit", ADMIN);

  const res = createRes();
  await controller.update({ ...req, params: { id }, body: { make: "Brenderup", trailer: { brakes: "yes", grossWeightKg: 750, selfWeightKg: 300 } } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.changed, true);

  const entry = auditStore.all().find((item) => item.action === "update");
  assert.equal(entry.by, ADMIN._id);
  assert.ok(entry.changes.some((change) => change.field === "make" && change.from === "Toyota" && change.to === "Brenderup"));
  assert.ok(entry.changes.some((change) => change.field === "trailer.brakes" && change.to === "yes"));

  const same = createRes();
  await controller.update({ ...req, params: { id }, body: { make: "Brenderup" } }, same);
  assert.equal(same.body.changed, false);

  const archiveRes = createRes();
  await controller.archive({ ...req, params: { id }, body: { reason: "sold" } }, archiveRes);
  assert.equal(archiveRes.body.vehicle.status, "archived");
  assert.equal(vehicleStore.all().length, 1, "archiving never deletes");

  const blocked = createRes();
  await controller.update({ ...req, params: { id }, body: { make: "X" } }, blocked);
  assert.equal(blocked.statusCode, 409);

  const restored = createRes();
  await controller.restore({ ...req, params: { id } }, restored);
  assert.equal(restored.body.vehicle.status, "active");
});

test("status cannot be set to archived through a normal update", async () => {
  const { controller } = setup();
  const created = await createVehicle(controller);
  const { req } = await guard(controller, "edit", ADMIN);
  const res = createRes();
  await controller.update({ ...req, params: { id: created.body.vehicle._id }, body: { status: "archived" } }, res);
  assert.equal(res.statusCode, 400);
});

test("trailer weights are validated server-side", async () => {
  const { controller } = setup();
  const res = await createVehicle(controller, { type: "trailer", trailer: { selfWeightKg: 900, grossWeightKg: 750 } });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors["trailer.grossWeightKg"]);
});

test("licence history is kept and date corrections need a reason", async () => {
  const { controller, auditStore } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "compliance", ADMIN);

  const add = createRes();
  await controller.addLicense({ ...req, params: { id }, body: { validUntil: "2026-12-01", feeStatus: "paid", feeAmount: "1500" } }, add);
  assert.equal(add.statusCode, 201);
  const recordId = add.body.vehicle.licenses[0].id;
  assert.equal(add.body.vehicle.summary.license.validUntil, "2026-12-01");

  // Payment alone does not change the expiry.
  const noReason = createRes();
  await controller.updateLicense({ ...req, params: { id, recordId }, body: { validUntil: "2027-01-01" } }, noReason);
  assert.equal(noReason.statusCode, 400);

  const withReason = createRes();
  await controller.updateLicense({ ...req, params: { id, recordId }, body: { validUntil: "2027-01-01", reason: "نسخة الرخصة تُظهر 2027" } }, withReason);
  assert.equal(withReason.statusCode, 200);
  const record = withReason.body.vehicle.licenses[0];
  assert.equal(record.validUntil, "2027-01-01");
  assert.equal(record.corrections.length, 1);
  assert.equal(record.corrections[0].from, "2026-12-01");
  assert.equal(record.corrections[0].reason, "نسخة الرخصة تُظهر 2027");
  assert.ok(auditStore.all().some((entry) => entry.action === "license.update" && entry.reason));

  // A renewal is a new record; the old one stays.
  const renew = createRes();
  await controller.addLicense({ ...req, params: { id }, body: { validUntil: "2028-01-01" } }, renew);
  assert.equal(renew.body.vehicle.licenses.length, 2);
  assert.equal(renew.body.vehicle.summary.license.validUntil, "2028-01-01");
});

test("fee payment does not make a licence or test valid", async () => {
  const { controller } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "compliance", ADMIN);
  const res = createRes();
  await controller.addLicense({ ...req, params: { id }, body: { validUntil: "2020-01-01", feeStatus: "paid" } }, res);
  assert.equal(res.body.vehicle.summary.license.state, "expired");
  assert.equal(res.body.vehicle.summary.test.state, "unknown");
});

test("tests: exemption needs a reason, next date is taken from the record, never computed", async () => {
  const { controller } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "compliance", ADMIN);

  const noReason = createRes();
  await controller.addTest({ ...req, params: { id }, body: { result: "exempt" } }, noReason);
  assert.equal(noReason.statusCode, 400);

  const passed = createRes();
  await controller.addTest({ ...req, params: { id }, body: { result: "passed", testDate: "2026-03-10", institute: "טסט" } }, passed);
  assert.equal(passed.statusCode, 201);
  assert.equal(passed.body.vehicle.nextTestDate, "", "no automatic +1 year");
  assert.equal(passed.body.vehicle.summary.test.state, "unknown");

  const withNext = createRes();
  await controller.addTest({ ...req, params: { id }, body: { result: "passed", testDate: "2026-04-10", nextTestDate: "2027-05-01" } }, withNext);
  assert.equal(withNext.body.vehicle.nextTestDate, "2027-05-01");
  assert.equal(withNext.body.vehicle.tests.length, 2);
});

test("correcting the official next test date requires a reason and is logged", async () => {
  const { controller, auditStore } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "compliance", ADMIN);

  const first = createRes();
  await controller.setNextTestDate({ ...req, params: { id }, body: { nextTestDate: "2027-05-01" } }, first);
  assert.equal(first.statusCode, 200, "no reason needed for the first entry");

  const noReason = createRes();
  await controller.setNextTestDate({ ...req, params: { id }, body: { nextTestDate: "2027-06-01" } }, noReason);
  assert.equal(noReason.statusCode, 400);

  const ok = createRes();
  await controller.setNextTestDate({ ...req, params: { id }, body: { nextTestDate: "2027-06-01", reason: "تغيير بقرار الوزارة" } }, ok);
  assert.equal(ok.statusCode, 200);
  const entry = auditStore.all().filter((item) => item.action === "nextTest.set").pop();
  assert.deepEqual(entry.changes[0], { field: "nextTestDate", from: "2027-05-01", to: "2027-06-01" });
});

test("insurance: several policies, statuses follow the records, history kept on cancel", async () => {
  const { controller } = setup();
  const created = await createVehicle(controller, { type: "trailer" });
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "compliance", ADMIN);

  const noInsurer = createRes();
  await controller.addPolicy({ ...req, params: { id }, body: { type: "mandatory", insurer: "" } }, noInsurer);
  assert.equal(noInsurer.statusCode, 400);

  const wrongRange = createRes();
  await controller.addPolicy({ ...req, params: { id }, body: { type: "mandatory", insurer: "X", startDate: "2027-01-01", endDate: "2026-01-01" } }, wrongRange);
  assert.equal(wrongRange.statusCode, 400);

  const future = createRes();
  await controller.addPolicy({ ...req, params: { id }, body: { type: "mandatory", insurer: "הראל", startDate: "2199-01-01", endDate: "2199-12-31" } }, future);
  assert.equal(future.statusCode, 201);
  assert.equal(future.body.vehicle.summary.insurance.status, "future", "a future policy is not active");

  const active = createRes();
  await controller.addPolicy({ ...req, params: { id }, body: { type: "comprehensive", insurer: "מגדל", startDate: "2020-01-01", endDate: "2199-06-01" } }, active);
  assert.equal(active.body.vehicle.summary.insurance.status, "active");
  assert.equal(active.body.vehicle.policies.length, 2);

  const activeId = active.body.vehicle.policies[1].id;
  const noReason = createRes();
  await controller.cancelPolicy({ ...req, params: { id, recordId: activeId }, body: {} }, noReason);
  assert.equal(noReason.statusCode, 400);

  const cancelled = createRes();
  await controller.cancelPolicy({ ...req, params: { id, recordId: activeId }, body: { reason: "بيعت المقطورة" } }, cancelled);
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.body.vehicle.policies.length, 2, "cancelled policy is kept");
  assert.equal(cancelled.body.vehicle.summary.insurance.status, "future", "cancelled is never active");

  const edit = createRes();
  await controller.updatePolicy({ ...req, params: { id, recordId: activeId }, body: { insurer: "Y", type: "other" } }, edit);
  assert.equal(edit.statusCode, 409, "a cancelled policy cannot be edited");
});

test("alerts: administrators see all, an assigned user only their vehicles", async () => {
  const { controller } = setup();
  await createVehicle(controller, { plate: "1111111", responsibleId: GUIDE._id });
  await createVehicle(controller, { plate: "2222222" });

  const adminReq = (await guard(controller, "view", ADMIN)).req;
  const adminRes = createRes();
  await controller.getAlerts(adminReq, adminRes);
  const adminPlates = new Set(adminRes.body.alerts.map((alert) => alert.plate));
  assert.deepEqual([...adminPlates].sort(), ["1111111", "2222222"]);
  assert.ok(adminRes.body.alerts.every((alert) => alert.level === "missing"), "no data is unknown, not healthy");

  const guideReq = as(GUIDE);
  const guideRes = createRes();
  await controller.attachActor(guideReq, createRes(), () => {});
  await controller.getAlerts(guideReq, guideRes);
  assert.deepEqual([...new Set(guideRes.body.alerts.map((alert) => alert.plate))], ["1111111"]);

  const viewerReq = as(VIEWER);
  await controller.attachActor(viewerReq, createRes(), () => {});
  const viewerRes = createRes();
  await controller.getAlerts(viewerReq, viewerRes);
  assert.equal(new Set(viewerRes.body.alerts.map((alert) => alert.plate)).size, 2, "a viewer sees every vehicle's alerts");
});

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");

test("documents: type is checked from the bytes, stored privately, drive id never exposed", async () => {
  const { controller, uploads } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "documents", ADMIN);

  const fake = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "license" }, file: { buffer: Buffer.from("MZ not a pdf"), mimetype: "application/pdf", originalname: "a.pdf" } }, fake);
  assert.equal(fake.statusCode, 400);
  assert.equal(uploads.length, 0);

  const empty = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: {}, file: { buffer: Buffer.alloc(0), mimetype: "application/pdf" } }, empty);
  assert.equal(empty.statusCode, 400);

  const none = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: {} }, none);
  assert.equal(none.statusCode, 400);

  const ok = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "license" }, file: { buffer: PDF, mimetype: "image/png", originalname: "../../evil.exe" } }, ok);
  assert.equal(ok.statusCode, 201);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].name, /^1234567_license_\d{14}\.pdf$/, "name is generated, not taken from the upload");
  assert.equal(uploads[0].mimeType, "application/pdf", "mime comes from the bytes");
  assert.equal(uploads[0].folderPath, "Vehicles/1234567");
  const published = JSON.stringify(ok.body);
  assert.equal(published.includes("drive-1"), false, "the Drive file id is never sent to the browser");
});

test("documents: linking must point at an existing record; replacing keeps the old one", async () => {
  const { controller } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const compliance = (await guard(controller, "compliance", ADMIN)).req;
  const lic = createRes();
  await controller.addLicense({ ...compliance, params: { id }, body: { validUntil: "2027-01-01" } }, lic);
  const licenseId = lic.body.vehicle.licenses[0].id;

  const { req } = await guard(controller, "documents", ADMIN);
  const dangling = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "license", linkedType: "license", linkedId: "nope" }, file: { buffer: PDF } }, dangling);
  assert.equal(dangling.statusCode, 400);

  const first = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "license", linkedType: "license", linkedId: licenseId }, file: { buffer: PDF } }, first);
  assert.equal(first.statusCode, 201);
  const firstId = first.body.document.id;

  const second = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "license", linkedType: "license", linkedId: licenseId, replacesId: firstId }, file: { buffer: PDF } }, second);
  const documents = second.body.vehicle.documents;
  assert.equal(documents.length, 2, "the replaced document is kept");
  assert.ok(documents.find((doc) => doc.id === firstId).supersededAt);
  assert.equal(documents.find((doc) => doc.id === second.body.document.id).supersededAt, "");

  const badReplace = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "license", replacesId: "missing" }, file: { buffer: PDF } }, badReplace);
  assert.equal(badReplace.statusCode, 400);
});

test("download sends private, non-sniffable headers and the permission guard blocks others", async () => {
  const { controller } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "documents", ADMIN);
  const up = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "receipt" }, file: { buffer: PDF } }, up);
  const docId = up.body.document.id;

  assert.equal((await guard(controller, "documents", VIEWER)).passed, false);
  assert.equal((await guard(controller, "documents", GUIDE)).passed, false);

  const res = createRes();
  res.pipeTarget = true;
  const { PassThrough } = require("node:stream");
  const sink = new PassThrough();
  Object.assign(sink, res, { statusCode: 200, headers: {}, set(map) { Object.assign(this.headers, map); return this; } });
  await controller.downloadDocument({ ...req, params: { id, docId }, query: {} }, sink);
  assert.equal(sink.headers["Content-Type"], "application/pdf");
  assert.match(sink.headers["Content-Disposition"], /^attachment;/);
  assert.equal(sink.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(sink.headers["Cache-Control"], "private, no-store");

  const missing = createRes();
  await controller.downloadDocument({ ...req, params: { id, docId: "nope" }, query: {} }, missing);
  assert.equal(missing.statusCode, 404);
});

test("unknown or malformed ids give 404, not a crash", async () => {
  const { controller } = setup();
  const { req } = await guard(controller, "view", ADMIN);
  for (const id of ["not-an-id", "f".repeat(24)]) {
    const res = createRes();
    await controller.getById({ ...req, params: { id } }, res);
    assert.equal(res.statusCode, 404);
  }
});

test("getMyPermissions reports what the caller may do", async () => {
  const { controller } = setup();
  for (const [user, expected] of [[ADMIN, ["view", "edit", "compliance", "documents", "archive"]], [GUIDE, []], [DOCS, ["view", "documents"]]]) {
    const req = as(user);
    await controller.attachActor(req, createRes(), () => {});
    const res = createRes();
    await controller.getMyPermissions(req, res);
    assert.deepEqual(res.body.permissions, expected);
  }
});

test("official lookup validates the plate and returns a proposal, never saving", async () => {
  const { controller, vehicleStore } = setup();
  const { req } = await guard(controller, "edit", ADMIN);
  const bad = createRes();
  await controller.officialLookup({ ...req, params: { plate: "12" } }, bad);
  assert.equal(bad.statusCode, 400);
  const ok = createRes();
  await controller.officialLookup({ ...req, params: { plate: "12-345-67" } }, ok);
  assert.equal(ok.body.plate, "1234567", "the plate is normalised before the lookup");
  assert.equal(vehicleStore.all().length, 0);
  assert.equal((await guard(controller, "edit", VIEWER)).passed, false, "viewers cannot trigger lookups");
});

test("an update records the official import source with the change", async () => {
  const { controller, auditStore } = setup();
  const created = await createVehicle(controller);
  const { req } = await guard(controller, "edit", ADMIN);
  const res = createRes();
  await controller.update({ ...req, params: { id: created.body.vehicle._id },
    body: { make: "Hyundai", importSource: { name: "data.gov.il", fetchedAt: "2026-10-02T10:00:00.000Z", fields: ["make"] } } }, res);
  assert.equal(res.statusCode, 200);
  const entry = auditStore.all().find((item) => item.action === "update");
  assert.deepEqual(entry.details, { importedFrom: "data.gov.il", fetchedAt: "2026-10-02T10:00:00.000Z", fields: ["make"] });

  const forged = createRes();
  await controller.update({ ...req, params: { id: created.body.vehicle._id },
    body: { make: "Kia", importSource: { name: "somewhere-else", fetchedAt: "x" } } }, forged);
  const last = auditStore.all().filter((item) => item.action === "update").pop();
  assert.equal(last.details, null, "an unknown source is ignored");
});

async function adminDelete(controller, id, body) {
  const guarded = await guard(controller, "view", ADMIN);
  const res = createRes();
  await controller.remove({ ...guarded.req, params: { id }, body }, res);
  return { res };
}

test("deletion is limited to administrators, even with every delegable permission", async () => {
  const { controller } = setup();
  for (const user of [GUIDE, VIEWER, DOCS]) {
    const res = createRes();
    let passed = false;
    await controller.requireAdmin(as(user), res, () => { passed = true; });
    assert.equal(passed, false);
    assert.equal(res.statusCode, 403);
  }
  let adminPassed = false;
  await controller.requireAdmin(as(ADMIN), createRes(), () => { adminPassed = true; });
  assert.equal(adminPassed, true);
});

test("delete needs the plate typed back and leaves nothing behind: vehicle, log and Drive files", async () => {
  const { controller, vehicleStore, auditStore, drive } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const compliance = (await guard(controller, "compliance", ADMIN)).req;
  await controller.addLicense({ ...compliance, params: { id }, body: { validUntil: "2027-01-01" } }, createRes());
  await controller.addPolicy({ ...compliance, params: { id }, body: { type: "mandatory", insurer: "X" } }, createRes());
  const docs = (await guard(controller, "documents", ADMIN)).req;
  for (let i = 0; i < 2; i += 1) {
    await controller.uploadDocument({ ...docs, params: { id }, body: { kind: "receipt" }, file: { buffer: PDF } }, createRes());
  }
  assert.ok(auditStore.all().length >= 4);

  const wrong = await adminDelete(controller, id, { confirmPlate: "1111111" });
  assert.equal(wrong.res.statusCode, 400);
  assert.equal(vehicleStore.all().length, 1, "nothing is deleted without the right confirmation");
  assert.equal(drive.deleted.length, 0);

  const done = await adminDelete(controller, id, { confirmPlate: "12-345-67" });
  assert.equal(done.res.statusCode, 200);
  assert.equal(vehicleStore.all().length, 0);
  assert.deepEqual(drive.deleted.filter((item) => item.startsWith("drive-")).sort(), ["drive-1", "drive-2"]);
  assert.ok(drive.deleted.includes("folder-1"), "the vehicle's Drive folder is removed too");
  assert.equal(auditStore.all().length, 0, "no record about the vehicle remains, not even a marker");
  assert.equal((await adminDelete(controller, id, { confirmPlate: "1234567" })).res.statusCode, 404);
});

test("a Drive failure keeps every record so the delete can be retried", async () => {
  const { controller, vehicleStore, auditStore, drive } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const docs = (await guard(controller, "documents", ADMIN)).req;
  await controller.uploadDocument({ ...docs, params: { id }, body: { kind: "receipt" }, file: { buffer: PDF } }, createRes());
  const auditBefore = auditStore.all().length;
  drive.failOn = "drive-1";
  const failed = await adminDelete(controller, id, { confirmPlate: "1234567" });
  assert.equal(failed.res.statusCode, 502);
  assert.equal(vehicleStore.all().length, 1);
  assert.equal(auditStore.all().length, auditBefore);
  drive.failOn = null;
  assert.equal((await adminDelete(controller, id, { confirmPlate: "1234567" })).res.statusCode, 200);
  assert.equal(vehicleStore.all().length, 0);
});

test("a document can belong to a whole section without a specific record", async () => {
  const { controller } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const { req } = await guard(controller, "documents", ADMIN);
  const res = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "policy", linkedType: "policy" }, file: { buffer: PDF } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.document.linkedType, "policy");
  assert.equal(res.body.document.linkedId, "");
  const bad = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "policy", linkedType: "nonsense" }, file: { buffer: PDF } }, bad);
  assert.equal(bad.statusCode, 400);
});

async function uploadOne(controller, id, body = {}) {
  const { req } = await guard(controller, "documents", ADMIN);
  const res = createRes();
  await controller.uploadDocument({ ...req, params: { id }, body: { kind: "receipt", ...body }, file: { buffer: PDF } }, res);
  return res;
}

test("a document may carry an optional display name that can be changed later", async () => {
  const { controller, auditStore, uploads } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const plain = await uploadOne(controller, id);
  assert.equal(plain.body.document.title, "");
  const named = await uploadOne(controller, id, { title: "  إيصال الرخصة 2026  " });
  assert.equal(named.body.document.title, "إيصال الرخصة 2026");
  assert.match(uploads[1].name, /^1234567_receipt_\d{14}\.pdf$/, "the Drive name is still generated");

  const { req } = await guard(controller, "documents", ADMIN);
  const docId = named.body.document.id;
  const renamed = createRes();
  await controller.updateDocument({ ...req, params: { id, docId }, body: { title: "بوليصة الهראל" } }, renamed);
  assert.equal(renamed.statusCode, 200);
  assert.equal(renamed.body.vehicle.documents.find((doc) => doc.id === docId).title, "بوليصة الهראל");
  const entry = auditStore.all().find((item) => item.action === "document.rename");
  assert.deepEqual(entry.changes[0], { field: "documents.title", from: "إيصال الرخصة 2026", to: "بوليصة الهראל" });

  const cleared = createRes();
  await controller.updateDocument({ ...req, params: { id, docId }, body: { title: "" } }, cleared);
  assert.equal(cleared.body.vehicle.documents.find((doc) => doc.id === docId).title, "");
  const missing = createRes();
  await controller.updateDocument({ ...req, params: { id, docId: "nope" }, body: { title: "x" } }, missing);
  assert.equal(missing.statusCode, 404);
});

test("deleting a file removes it from Drive and the record, and keeps the log", async () => {
  const { controller, auditStore, drive } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const first = await uploadOne(controller, id);
  const { req } = await guard(controller, "documents", ADMIN);

  const res = createRes();
  await controller.removeDocument({ ...req, params: { id, docId: first.body.document.id } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vehicle.documents.length, 0);
  assert.deepEqual(drive.deleted, ["drive-1"]);
  assert.ok(auditStore.all().some((item) => item.action === "document.delete"));

  const again = createRes();
  await controller.removeDocument({ ...req, params: { id, docId: first.body.document.id } }, again);
  assert.equal(again.statusCode, 404);
});

test("a Drive failure keeps the file record; deleting a newer version restores the older one", async () => {
  const { controller, drive } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const older = await uploadOne(controller, id);
  const newer = await uploadOne(controller, id, { replacesId: older.body.document.id });
  assert.ok(newer.body.vehicle.documents.find((doc) => doc.id === older.body.document.id).supersededAt);
  const { req } = await guard(controller, "documents", ADMIN);

  drive.failOn = "drive-2";
  const failed = createRes();
  await controller.removeDocument({ ...req, params: { id, docId: newer.body.document.id } }, failed);
  assert.equal(failed.statusCode, 502);

  drive.failOn = null;
  const ok = createRes();
  await controller.removeDocument({ ...req, params: { id, docId: newer.body.document.id } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.vehicle.documents.length, 1);
  assert.equal(ok.body.vehicle.documents[0].supersededAt, "", "the older version is current again");
});

test("renaming or deleting files needs the documents permission and an unarchived vehicle", async () => {
  const { controller } = setup();
  const created = await createVehicle(controller);
  const id = created.body.vehicle._id;
  const doc = await uploadOne(controller, id);
  assert.equal((await guard(controller, "documents", VIEWER)).passed, false);
  const { req } = await guard(controller, "archive", ADMIN);
  await controller.archive({ ...req, params: { id }, body: {} }, createRes());
  const adminReq = (await guard(controller, "documents", ADMIN)).req;
  const blocked = createRes();
  await controller.removeDocument({ ...adminReq, params: { id, docId: doc.body.document.id } }, blocked);
  assert.equal(blocked.statusCode, 409);
});
