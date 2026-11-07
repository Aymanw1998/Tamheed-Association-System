const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDate, formatDateTime } = require("../../shared/dateFormat");
const { createMailDelivery } = require("../services/mailDelivery");
const { storageOwnerLabel } = require("../utils/storageOwnerLabel");
const { createReportPdfQueue } = require("../services/reportPdfQueue");
const { reportPdfHtml } = require("../services/reportPdfHtml");
const { createReportPdfController } = require("../Entities/Report/ReportPdf.controller");
const { effectivePermissions } = require("../utils/permissions");
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("all systems share DMY dates, explicit Jerusalem time and no date-only drift", () => {
  assert.equal(formatDate("2026-11-07"), "07/11/2026");
  assert.equal(formatDate("07/11/2026"), "07/11/2026");
  assert.equal(formatDateTime("2026-11-06T22:30:00Z"), "07/11/2026 00:30");
  assert.equal(formatDateTime("2026-11-07"), "07/11/2026");
  assert.equal(formatDate("2026-02-31"), "—");
  assert.equal(formatDate(null), "—");
});
test("mail transport is pooled, reused and records only timing/status", async () => {
  let created = 0; const seen = [], metrics = [];
  const delivery = createMailDelivery({ createTransport: (options) => { created++; assert.equal(options.pool, true); assert.equal(options.maxRequeues, 0); return { sendMail: async (body) => { seen.push(body); return { messageId: "test" }; } }; }, config: () => ({ host: "smtp.example.test" }), onMetric: (metric) => metrics.push(metric) });
  await delivery.sendMail({ to: "synthetic@example.test", text: "synthetic-code" });
  await delivery.sendMail({ to: "synthetic@example.test", text: "second" });
  assert.equal(created, 1); assert.equal(seen.length, 2);
  assert.deepEqual(Object.keys(metrics[0]).sort(), ["attempts", "elapsedMs", "status"]);
});
test("mail retries only an unambiguous connection failure, never post-DATA delivery", async () => {
  for (const command of ["CONN", "DATA"]) {
    let calls = 0;
    const delivery = createMailDelivery({ config: () => ({}), delay: async () => {}, createTransport: () => ({ sendMail: async () => { if (++calls === 1) throw Object.assign(new Error("unavailable"), { code: "ECONNECTION", command }); return {}; } }) });
    if (command === "CONN") await delivery.sendMail({}); else await assert.rejects(delivery.sendMail({}));
    assert.equal(calls, command === "CONN" ? 2 : 1);
  }
});
test("owner labels distinguish system, known user and unknown identity without exposing ids", () => {
  assert.equal(storageOwnerLabel({ ownerId: "system" }), "النظام");
  assert.equal(storageOwnerLabel({ ownerId: "abcdef1234567890abcdef12", relativePath: "tamheed_db/root/users" }), "النظام");
  assert.equal(storageOwnerLabel({ ownerId: "abcdef1234567890abcdef12", knownName: "اسم تجريبي" }), "اسم تجريبي");
  assert.equal(storageOwnerLabel({ ownerId: "abcdef1234567890abcdef12" }), "غير معروف");
});
test("PDF queue never exposes another user's job, supports cancel and bounds retention", async () => {
  let now = 0, finish; const q = createReportPdfQueue({ now: () => now, ttlMs: 1000, render: () => new Promise((done) => { finish = done; }) });
  const job = q.start("one", "report", { info: "synthetic" }); await flush();
  assert.equal(q.status(job.id, "two"), null);
  assert.equal(q.status(job.id, "one").state, "rendering");
  q.cancel(job.id, "one"); finish(Buffer.from("%PDF-test")); await flush();
  assert.equal(q.file(job.id, "one"), null);
  now = 1001; assert.equal(q.status(job.id, "one"), null); q.close();
});
test("PDF queue serializes rendering and reuses one pending job per report/owner", async () => {
  let active = 0, max = 0;
  const q = createReportPdfQueue({ render: async () => { active++; max = Math.max(max, active); await flush(); active--; return Buffer.from("%PDF-test"); } });
  const one = q.start("owner", "first", {}); assert.equal(q.start("owner", "first", {}).id, one.id);
  const two = q.start("owner", "second", {}); assert.throws(() => q.start("owner", "third", {}), /PDF_BUSY/);
  for (let i = 0; i < 8; i++) await flush();
  assert.equal(max, 1); assert.equal(q.status(two.id, "owner").state, "ready"); q.close();
});
test("PDF HTML keeps Arabic rich text and tables, strips scripts, remote requests and injected titles", () => {
  const html = reportPdfHtml({ stitle: '<script>alert(1)</script>', info: '<p>تقرير تجريبي</p><table><tr><td>خانة</td></tr></table><script>bad()</script><img src="http://127.0.0.1/private"><iframe src="file:///secret"></iframe>' });
  assert.ok(html.includes("تقرير تجريبي")); assert.ok(html.includes("<table>"));
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes("127.0.0.1")); assert.ok(!html.includes("file:///"));
});
test("PDF download/status recheck current report permission and scope", async () => {
  const id = "abcdef1234567890abcdef12", q = createReportPdfQueue({ render: async () => Buffer.from("%PDF-test") });
  const controller = createReportPdfController({ reports: { get: async () => ({ result: [{ _id: id, createdBy: "owner", info: "synthetic" }] }) }, jobs: q });
  const request = { user: { id: "owner" }, actor: { id: "owner", permissions: effectivePermissions({ role: "مرشد" }) }, params: { id } };
  const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, set() { return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
  const start = res(); await controller.start(request, start); assert.equal(start.statusCode, 202);
  await flush(); request.params.job = start.body.job.id;
  request.actor.permissions = effectivePermissions({ role: "مرشد", permissionRevokes: ["reports.exportPdf"] });
  const blocked = res(); await controller.download(request, blocked); assert.equal(blocked.statusCode, 403);
  request.actor.permissions = effectivePermissions({ role: "مرشد" }); request.user.id = "other";
  const foreign = res(); await controller.status(request, foreign); assert.equal(foreign.statusCode, 403);
  q.close();
});
