const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// In-memory stand-in for ReportModelDef's generic Mongo-backed CRUD, so these
// tests exercise the real controller logic (Report.controller.js) without a
// database.
function createReportModel(seedReports = []) {
  let reports = seedReports.map((report, index) => ({ _id: `report-${index}`, ...report }));
  let nextId = reports.length;

  const matches = (report, filter = {}) =>
    Object.keys(filter).every((key) => String(report[key]) === String(filter[key]));

  return {
    async get(filter = {}) {
      return { success: true, result: reports.filter((report) => matches(report, filter)) };
    },
    async create(data) {
      const doc = { _id: `report-${nextId++}`, ...data };
      reports.push(doc);
      return { success: true, insertedId: doc._id };
    },
    async update(filter, newData) {
      reports = reports.map((report) =>
        matches(report, filter) ? { ...report, ...newData } : report
      );
      return { success: true };
    },
    async delete(filter) {
      reports = reports.filter((report) => !matches(report, filter));
      return { success: true };
    },
    snapshot: () => reports.map((report) => ({ ...report })),
  };
}

// Load the real handler with inert dependencies: importing the application
// normally initializes database, storage, email, and logging integrations.
function loadController(reportModel) {
  const dependencies = {
    "./Report.model.js": { ReportModelDef: reportModel },
    "../../middleware/logger.js": { logWithSource() {} },
    "../../utils/textEncoding.js": require("../utils/textEncoding"),
    "../Notification/Notification.controller": {},
  };
  const filename = path.join(__dirname, "../Entities/Report/Report.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

function createRes() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("getAll returns every report to an admin but only the caller's own reports to a guide/assistant", async () => {
  const model = createReportModel([
    { createdBy: "user-a", info: "a1", title: [], attendance: [] },
    { createdBy: "user-b", info: "b1", title: [], attendance: [] },
  ]);
  const { getAll } = loadController(model);

  const adminRes = createRes();
  await getAll({ query: {}, user: { id: "user-admin", roles: ["ادارة"] } }, adminRes);
  assert.equal(adminRes.body.reports.length, 2);

  const guideRes = createRes();
  await getAll({ query: {}, user: { id: "user-a", roles: ["مرشد"] } }, guideRes);
  assert.deepEqual(guideRes.body.reports.map((report) => report.createdBy), ["user-a"]);

  const assistantRes = createRes();
  await getAll({ query: {}, user: { id: "user-b", roles: ["مساعد"] } }, assistantRes);
  assert.deepEqual(assistantRes.body.reports.map((report) => report.createdBy), ["user-b"]);
});

test("getById rejects a guide/assistant reading a report they do not own", async () => {
  const model = createReportModel([
    { createdBy: "user-a", info: "a1", title: [], attendance: [] },
  ]);
  const { getById } = loadController(model);

  const forbidden = createRes();
  await getById({ params: { id: "report-0" }, user: { id: "user-b", roles: ["مساعد"] } }, forbidden);
  assert.equal(forbidden.statusCode, 403);

  const ownerOk = createRes();
  await getById({ params: { id: "report-0" }, user: { id: "user-a", roles: ["مرشد"] } }, ownerOk);
  assert.equal(ownerOk.statusCode, 200);

  const adminOk = createRes();
  await getById({ params: { id: "report-0" }, user: { id: "user-admin", roles: ["ادارة"] } }, adminOk);
  assert.equal(adminOk.statusCode, 200);
});

test("post ignores a client-supplied createdBy and attributes the report to the authenticated caller", async () => {
  const model = createReportModel([]);
  const { post } = loadController(model);

  const res = createRes();
  await post({
    body: { info: "new report", createdBy: "someone-else" },
    user: { id: "user-a", tz: "tz-a", roles: ["مساعد"] },
  }, res);

  assert.equal(res.statusCode, 201);
  const [stored] = model.snapshot();
  assert.equal(stored.createdBy, "user-a");
});

test("put rejects a guide/assistant editing a report they do not own, and applies the change for the owner or an admin", async () => {
  const model = createReportModel([
    { createdBy: "user-a", info: "original", title: [], attendance: [] },
  ]);
  const { put } = loadController(model);

  const forbidden = createRes();
  await put({
    params: { id: "report-0" },
    body: { info: "hijacked" },
    user: { id: "user-b", roles: ["مساعد"] },
  }, forbidden);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(model.snapshot()[0].info, "original");

  const ownerRes = createRes();
  await put({
    params: { id: "report-0" },
    body: { info: "updated by owner" },
    user: { id: "user-a", roles: ["مرشد"] },
  }, ownerRes);
  assert.equal(ownerRes.statusCode, 200);
  assert.equal(model.snapshot()[0].info, "updated by owner");

  const adminRes = createRes();
  await put({
    params: { id: "report-0" },
    body: { info: "updated by admin" },
    user: { id: "user-admin", roles: ["ادارة"] },
  }, adminRes);
  assert.equal(adminRes.statusCode, 200);
  assert.equal(model.snapshot()[0].info, "updated by admin");
});
