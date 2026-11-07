const { fork } = require("node:child_process");
const path = require("node:path");
function renderReportPdf(report, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cancelled"));
    const identity = process.platform !== "win32" && /^\d+$/.test(process.env.PDF_RENDER_UID || "") ? { uid: Number(process.env.PDF_RENDER_UID), ...(/^\d+$/.test(process.env.PDF_RENDER_GID || "") ? { gid: Number(process.env.PDF_RENDER_GID) } : {}) } : {};
    // Credentials are deliberately not inherited by the renderer process.
    const env = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "PDF_CHROME_EXECUTABLE"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    const child = fork(path.join(__dirname, "reportPdfWorker.js"), [], { ...identity, env, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
    let settled = false;
    const finish = (error, buffer) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); if (error) { child.kill("SIGTERM"); reject(error); } else resolve(buffer); };
    const abort = () => finish(new Error("cancelled"));
    const timer = setTimeout(() => finish(new Error("PDF_TIMEOUT")), 100000); timer.unref?.();
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => finish(error));
    child.once("exit", () => finish(new Error("PDF_EXIT")));
    child.once("message", (message) => message?.ok ? finish(null, Buffer.from(message.pdf || "", "base64")) : finish(Object.assign(new Error("PDF_FAILED"), { code: message?.code })));
    child.send({ report });
  });
}
module.exports = { renderReportPdf };
