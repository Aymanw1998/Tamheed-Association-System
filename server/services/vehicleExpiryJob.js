// Nightly check (01:00 Asia/Jerusalem): every non-archived vehicle's licence,
// test and insurance. New stages become notices for the administrators and
// one digest email each. Dependencies are injectable for tests.
const cron = require("node-cron");
const rules = require("../utils/vehicleRules");
const { planVehicleNotices, buildDigest } = require("../utils/vehicleNotices");

const JOB = "vehicleExpiry";
const TIME_ZONE = "Asia/Jerusalem";
let running = false;

function createDeps() {
  const { VehicleModelDef } = require("../Entities/Vehicle/Vehicle.model");
  const { JobRunModelDef } = require("../Entities/Notice/Notice.model");
  const notices = require("../Entities/Notice/Notice.service");
  const mail = require("../utils/sendEmail");
  const { logWithSource } = require("../middleware/logger");
  return {
    async loadVehicles() {
      const found = await VehicleModelDef.get({});
      return (found?.result || []).filter((v) => v.status !== "archived");
    },
    existingDedupKeys: () => notices.existingDedupKeys("vehicle:"),
    publishNotice: (n) => notices.publishNotice(n),
    listAdmins: () => notices.listAdmins(),
    smtpConfigured: mail.smtpConfigured,
    sendDigest: (to, digest) => mail.sendNoticeDigestEmail(to, digest),
    async findRun(job, date) {
      const found = await JobRunModelDef.get({ job, date });
      return found?.result?.[0] || null;
    },
    saveRun: (row) => JobRunModelDef.create(row),
    log: (...args) => logWithSource("[vehicleExpiry]", ...args),
  };
}

function jerusalemHour(now) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

async function runVehicleExpiryCheck({ now = new Date(), trigger = "cron", deps = createDeps() } = {}) {
  if (running) return { skipped: "running" };
  const today = rules.todayInJerusalem(now);
  running = true;
  const result = { today, trigger, created: 0, emailed: 0, emailErrors: 0 };
  try {
    const vehicles = await deps.loadVehicles();
    const alerts = [];
    for (const vehicle of vehicles) {
      try {
        alerts.push(...rules.buildAlerts(vehicle, today));
      } catch (err) {
        deps.log("vehicle failed", vehicle?._id, err);
      }
    }
    const planned = planVehicleNotices(alerts, await deps.existingDedupKeys());
    const fresh = [];
    for (const notice of planned) {
      try {
        const { created } = await deps.publishNotice(notice);
        if (created) {
          fresh.push(notice);
          result.created += 1;
        }
      } catch (err) {
        deps.log("publish failed", notice?.dedupKey, err?.message);
      }
    }

    if (fresh.length && deps.smtpConfigured()) {
      const digest = buildDigest(fresh);
      for (const admin of await deps.listAdmins()) {
        try {
          await deps.sendDigest(admin.email, digest);
          result.emailed += 1;
        } catch (err) {
          result.emailErrors += 1;
          deps.log("email failed", admin.id, err?.message);
        }
      }
    }
  } catch (err) {
    result.error = String(err?.message || err);
    deps.log("run failed", err);
    await deps
      .publishNotice({
        title: "فشل الفحص الليلي للمركبات",
        body: `لم يكتمل فحص المركبات بتاريخ ${today}. السبب: ${result.error}`.slice(0, 2000),
        category: "system",
        severity: "critical",
        dedupKey: `system:${JOB}:failed:${today}`,
      })
      .catch(() => null);
  } finally {
    running = false;
  }
  await deps
    .saveRun({ job: JOB, date: today, trigger, created: result.created, emailed: result.emailed, error: result.error || null, finishedAt: new Date().toISOString() })
    .catch((err) => deps.log("saveRun failed", err));
  return result;
}

// After a restart: run once if 01:00 has passed today and nothing ran yet.
async function catchUpVehicleExpiryCheck({ now = new Date(), deps = createDeps() } = {}) {
  if (jerusalemHour(now) < 1) return null;
  const today = rules.todayInJerusalem(now);
  if (await deps.findRun(JOB, today)) return null;
  return runVehicleExpiryCheck({ now, trigger: "catch-up", deps });
}

function startVehicleExpiryJob() {
  cron.schedule("0 1 * * *", () => runVehicleExpiryCheck().catch((err) => console.error("[vehicleExpiry] cron run failed:", err?.message || err)), { timezone: TIME_ZONE });
}

module.exports = { runVehicleExpiryCheck, catchUpVehicleExpiryCheck, startVehicleExpiryJob, createDeps };
