// Runs in a dedicated process; no database, credentials, URLs or mail access.
const fs = require("node:fs");
const { reportPdfHtml } = require("./reportPdfHtml");
let browser, stopping = false;
async function stop() { stopping = true; try { await browser?.close(); } finally { process.exit(0); } }
process.on("disconnect", stop); process.on("SIGTERM", stop);
process.on("message", async (message) => {
  if (message.cancel) return stop();
  try {
    const candidates = [process.env.PDF_CHROME_EXECUTABLE, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"];
    const executablePath = candidates.find((entry) => entry && fs.existsSync(entry));
    if (!executablePath || (process.getuid && process.getuid() === 0)) throw Object.assign(new Error("unavailable"), { code: "PDF_UNAVAILABLE" });
    const puppeteer = await import("puppeteer-core");
    browser = await puppeteer.default.launch({ executablePath, headless: true, timeout: 20000, args: ["--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => request.url().startsWith("data:image/png;base64,") ? request.continue() : request.abort());
    await page.setContent(reportPdfHtml(message.report), { waitUntil: "load", timeout: 20000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, timeout: 60000,
      displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    if (!stopping && process.send) await new Promise((resolve) => process.send({ ok: true, pdf: Buffer.from(pdf).toString("base64") }, resolve));
  } catch (error) { if (process.send) await new Promise((resolve) => process.send({ ok: false, code: error.code === "PDF_UNAVAILABLE" ? "PDF_UNAVAILABLE" : "PDF_FAILED" }, resolve)); }
  finally { await stop(); }
});
