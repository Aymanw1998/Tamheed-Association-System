// Excel exports (owner, 2026-11-16): managers only, each written in the audit log.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createExportController, programsSummary } = require("../Entities/Export/Export.controller");

async function serve(permissions, { auditWorks = true } = {}) {
  const logged = [];
  const app = express();
  app.use(express.json());
  const controller = createExportController({
    audit: { recordRequired: async (_req, entry) => { if (!auditWorks) return false; logged.push(entry); return true; } },
    listLessons: async () => [
      { _id: "L2", name: "ب", teacher: "u1", room: 2, list_students: ["s1", "s2"], date: { day: 2, startMin: 900, endMin: 960 } },
      { _id: "L1", name: "أ", teacher: "u2", room: 1, list_students: [], date: { day: 1, startMin: 960, endMin: 1020 } },
    ],
    marksBetween: async (from, to) => {
      assert.deepEqual([from, to], [20261101, 20261131]);
      return [
        { lesson: "L2", dateKey: 20261103, status: "حاضر" }, { lesson: "L2", dateKey: 20261103, status: "غائب" },
        { lesson: "L2", dateKey: 20261110, status: "متأخر" },
      ];
    },
    listUsers: async () => [{ _id: "u1", firstname: "مرشد", lastname: "أول" }],
  });
  app.use((req, _res, next) => { req.actor = { permissions: new Set(permissions) }; next(); });
  app.post("/api/exports/log", controller.log);
  app.get("/api/exports/programs", controller.programs);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/exports`;
  return { base, logged, close: () => new Promise((r) => server.close(r)) };
}
const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("a students or staff export is logged only for its managers", async () => {
  const admin = await serve(["students.viewAll", "users.view", "students.exportExcel", "users.exportExcel"]);
  assert.equal((await post(`${admin.base}/log`, { kind: "students", count: 12 })).status, 200);
  assert.equal((await post(`${admin.base}/log`, { kind: "users", count: 4 })).status, 200);
  assert.equal((await post(`${admin.base}/log`, { kind: "other" })).status, 400);
  assert.deepEqual(admin.logged.map((e) => [e.module, e.action, e.targetLabel]), [
    ["students", "export_excel", "تصدير قائمة الطلاب إلى Excel (12)"],
    ["users", "export_excel", "تصدير قائمة الموظفين إلى Excel (4)"],
  ]);
  await admin.close();
  const guide = await serve(["students.view"]);
  assert.equal((await post(`${guide.base}/log`, { kind: "students", count: 3 })).status, 403);
  assert.equal((await post(`${guide.base}/log`, { kind: "users", count: 3 })).status, 403);
  assert.equal(guide.logged.length, 0);
  await guide.close();
});

test("the month's program summary needs lessons.viewAll and attendance.view, and is logged", async () => {
  const half = await serve(["lessons.viewAll", "lessons.exportExcel"]);
  assert.equal((await fetch(`${half.base}/programs?month=2026-11`)).status, 403);
  await half.close();
  const admin = await serve(["lessons.viewAll", "attendance.view", "lessons.exportExcel"]);
  assert.equal((await fetch(`${admin.base}/programs?month=2026-13`)).status, 400);
  const res = await (await fetch(`${admin.base}/programs?month=2026-11`)).json();
  assert.equal(res.ok, true);
  assert.deepEqual(res.rows.map((r) => [r.name, r.teacher, r.students, r.days, r.present, r.late, r.absent, r.rate]), [
    ["أ", "", 0, 0, 0, 0, 0, null],
    ["ب", "مرشد أول", 2, 2, 1, 1, 1, 67],
  ]);
  assert.equal(admin.logged.length, 1);
  assert.match(admin.logged[0].targetLabel, /2026-11 \(2\)/);
  await admin.close();
});

test("programsSummary counts late as present and leaves the rate empty with no marks", () => {
  const [row] = programsSummary([{ _id: "x", name: "x", date: { day: 1 } }], [{ lesson: "x", dateKey: 1, status: "متأخر" }], []);
  assert.equal(row.rate, 100);
});

// Codex review, 2026-11-18.
test("a kind named like an object property is refused, not thrown", async () => {
  const admin = await serve(["students.viewAll", "students.exportExcel"]);
  for (const kind of ["constructor", "__proto__", "toString", "hasOwnProperty", "programs"]) {
    assert.equal((await post(`${admin.base}/log`, { kind })).status, 400, kind);
  }
  assert.equal(admin.logged.length, 0);
  await admin.close();
});

test("viewing without the export key does not export (owner, 2026-11-18)", async () => {
  const viewer = await serve(["students.viewAll", "users.view", "lessons.viewAll", "attendance.view"]);
  assert.equal((await post(`${viewer.base}/log`, { kind: "students", count: 1 })).status, 403);
  assert.equal((await post(`${viewer.base}/log`, { kind: "users", count: 1 })).status, 403);
  assert.equal((await fetch(`${viewer.base}/programs?month=2026-11`)).status, 403);
  await viewer.close();
});

test("no audit row, no export", async () => {
  const admin = await serve(["students.viewAll", "students.exportExcel", "lessons.viewAll", "attendance.view", "lessons.exportExcel"], { auditWorks: false });
  const res = await post(`${admin.base}/log`, { kind: "students", count: 2 });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "AUDIT_FAILED");
  const month = await fetch(`${admin.base}/programs?month=2026-11`);
  assert.equal(month.status, 503);
  assert.equal((await month.json()).rows, undefined);
  await admin.close();
});
