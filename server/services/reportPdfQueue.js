const { randomBytes } = require("node:crypto");

function createReportPdfQueue({ render, now = () => Date.now(), ttlMs = 10 * 60 * 1000, maxJobs = 16, maxBytes = 24 * 1024 * 1024 } = {}) {
  const jobs = new Map(); let active = false, buffered = 0;
  const drop = (job) => { if (job.buffer) buffered -= job.buffer.length; job.controller?.abort(); jobs.delete(job.id); };
  const sweep = () => { for (const job of jobs.values()) if (now() >= job.expiresAt) drop(job); };
  const pump = async () => {
    if (active) return;
    sweep(); const job = [...jobs.values()].find((item) => item.state === "queued");
    if (!job) return;
    active = true; job.state = "rendering"; job.controller = new AbortController();
    try {
      const buffer = Buffer.from(await render(job.payload, job.controller.signal));
      if (!jobs.has(job.id) || job.state === "cancelled") return;
      if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")) || buffer.length > maxBytes || buffered + buffer.length > maxBytes) throw new Error("PDF_LIMIT");
      job.buffer = buffer; buffered += buffer.length; job.state = "ready";
    } catch (error) {
      if (jobs.has(job.id) && job.state !== "cancelled") { job.state = "failed"; job.code = error.code === "PDF_UNAVAILABLE" ? "PDF_UNAVAILABLE" : "PDF_FAILED"; }
    } finally { job.payload = null; job.controller = null; active = false; queueMicrotask(pump); }
  };
  const view = (job) => job && ({ id: job.id, reportId: job.reportId, state: job.state, code: job.code || "", expiresAt: job.expiresAt });
  const get = (id, owner) => { sweep(); const job = jobs.get(String(id)); return job?.owner === String(owner) ? job : null; };
  return {
    start(owner, reportId, payload) {
      sweep(); const mine = [...jobs.values()].filter((job) => job.owner === String(owner) && ["queued", "rendering"].includes(job.state));
      const duplicate = mine.find((job) => job.reportId === String(reportId));
      if (duplicate) return view(duplicate);
      const retained = [...jobs.values()].filter((job) => job.owner === String(owner));
      if (retained.length >= 4) { const old = retained.find((job) => !["queued", "rendering"].includes(job.state)); if (old) drop(old); }
      if (jobs.size >= maxJobs) { const old = [...jobs.values()].find((job) => !["queued", "rendering"].includes(job.state)); if (old) drop(old); }
      if (mine.length >= 2 || jobs.size >= maxJobs) { const error = new Error("PDF_BUSY"); error.status = 429; throw error; }
      const job = { id: randomBytes(24).toString("hex"), owner: String(owner), reportId: String(reportId), payload, state: "queued", expiresAt: now() + ttlMs };
      jobs.set(job.id, job); queueMicrotask(pump); return view(job);
    },
    status(id, owner) { return view(get(id, owner)); },
    file(id, owner) { const job = get(id, owner); return job?.state === "ready" ? job.buffer : null; },
    cancel(id, owner) { const job = get(id, owner); if (!job) return false; job.state = "cancelled"; job.controller?.abort(); job.payload = null; if (job.buffer) { buffered -= job.buffer.length; job.buffer = null; } return true; },
    close() { for (const job of jobs.values()) drop(job); },
  };
}
module.exports = { createReportPdfQueue };
