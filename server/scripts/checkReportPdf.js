// Synthetic preflight only: no database, SMTP or real report reads.
const { renderReportPdf } = require("../services/renderReportPdf");
(async () => {
  const started = Date.now(); let ticks = 0, previous = started, maxGapMs = 0;
  const timer = setInterval(() => { ticks++; const now = Date.now(); maxGapMs = Math.max(maxGapMs, now - previous); previous = now; }, 10);
  try {
    const pdf = await renderReportPdf({ stitle: "فحص تصدير تجريبي", date: "2026-11-07", info: "<p>بيانات مصطنعة لفحص العربية.</p>".repeat(100) });
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("INVALID_PDF");
    console.log(JSON.stringify({ ok: true, elapsedMs: Date.now() - started, bytes: pdf.length, heartbeatTicks: ticks, maxGapMs }));
  } finally { clearInterval(timer); }
})().catch((error) => { console.error(error.code || error.message || "PDF_FAILED"); process.exitCode = 1; });
