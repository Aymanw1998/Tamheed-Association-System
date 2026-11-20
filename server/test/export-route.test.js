// Excel exports (owner, 2026-11-16): managers only, each written in the audit log.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createExportController } = require("../Entities/Export/Export.controller");

async function serve(permissions, { auditWorks = true } = {}) {
  const logged = [];
  const app = express();
  app.use(express.json());
  const controller = createExportController({
    audit: { recordRequired: async (_req, entry) => { if (!auditWorks) return false; logged.push(entry); return true; } },
  });
  app.use((req, _res, next) => { req.actor = { permissions: new Set(permissions) }; next(); });
  app.post("/api/exports/log", controller.log);
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
  const viewer = await serve(["students.viewAll", "users.view"]);
  assert.equal((await post(`${viewer.base}/log`, { kind: "students", count: 1 })).status, 403);
  assert.equal((await post(`${viewer.base}/log`, { kind: "users", count: 1 })).status, 403);
  await viewer.close();
});

test("no audit row, no export", async () => {
  const admin = await serve(["students.viewAll", "students.exportExcel"], { auditWorks: false });
  const res = await post(`${admin.base}/log`, { kind: "students", count: 2 });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "AUDIT_FAILED");
  await admin.close();
});
