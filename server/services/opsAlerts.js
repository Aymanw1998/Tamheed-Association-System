// Tells the owner by email when the server goes down (owner, 2026-11-10):
//   - a crash: written to a file while the process dies (no time to send
//     mail), told on the start that follows (pm2 restarts the server);
//   - the database connection lost for more than DB_GRACE_MS, and its return.
// The address is OPS_ALERT_EMAIL in server/config/.env, never in the
// repository. Without it nothing is sent. Emails of one kind are throttled
// (THROTTLE_MS, kept in a file so a restart loop does not flood the inbox).
// A whole machine that is off cannot tell anything: an outside check of
// /api/health covers that (deploy/DEPLOY.md, "התראה כשהשרת נופל").
const fs = require("fs");
const os = require("os");
const path = require("path");

const THROTTLE_MS = 30 * 60 * 1000;
const DB_GRACE_MS = 2 * 60 * 1000;
const MAX_MESSAGE = 300;
const CRASH_FILE = "last-crash.json";
const SENT_FILE = "ops-alerts-sent.json";

const stamp = (t) => new Date(t).toISOString().replace("T", " ").slice(0, 19) + " UTC";
// The message only, never the stack: it may name files, never secrets, but is cut short.
const shortMessage = (err) => String(err?.message ?? err ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE);

function createOpsAlerts(deps = {}) {
  const {
    dir = process.env.OPS_STATE_DIR || path.join(os.tmpdir(), "tamheed-ops"),
    to = () => String(process.env.OPS_ALERT_EMAIL || "").trim(),
    send = (address, subject, text) => require("../utils/sendEmail").sendOpsAlertEmail(address, subject, text),
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (timer) => clearTimeout(timer),
    log = (...args) => console.error("[ops-alerts]", ...args),
  } = deps;

  const file = (name) => path.join(dir, name);
  const readJson = (name) => {
    try { return JSON.parse(fs.readFileSync(file(name), "utf8")); } catch { return null; }
  };
  const writeJson = (name, value) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file(name), JSON.stringify(value));
  };

  // Sends one alert of `kind` unless one went out less than THROTTLE_MS ago.
  // Never throws.
  async function alert(kind, subject, text, { throttle = true } = {}) {
    const address = to();
    if (!address) return false;
    const sentAt = readJson(SENT_FILE) || {};
    if (throttle && sentAt[kind] && now() - sentAt[kind] < THROTTLE_MS) return false;
    try {
      await send(address, `تمهيد: ${subject}`, text);
      writeJson(SENT_FILE, { ...sentAt, [kind]: now() });
      return true;
    } catch (err) {
      log("send failed:", shortMessage(err));
      return false;
    }
  }

  // Synchronous: called from the crash handlers just before the process exits.
  function recordCrash(kind, err) {
    try {
      writeJson(CRASH_FILE, { kind: String(kind), message: shortMessage(err), at: now() });
    } catch (e) {
      log("could not record the crash:", shortMessage(e));
    }
  }

  // On every start: a crash recorded by the previous process is told once.
  async function onStartup() {
    const crash = readJson(CRASH_FILE);
    if (!crash) return;
    try { fs.unlinkSync(file(CRASH_FILE)); } catch { /* already gone */ }
    await alert("crash", "توقف الخادم وعاد للعمل", [
      "توقف خادم تمهيد بسبب خطأ، وأعاد pm2 تشغيله.",
      `الوقت: ${stamp(crash.at)}`,
      `النوع: ${crash.kind}`,
      `الرسالة: ${crash.message || "—"}`,
      "التفاصيل الكاملة في: pm2 logs tamheed",
    ].join("\n"));
  }

  // mongoose's connection events: told when the drop outlasts DB_GRACE_MS.
  function watchDb(connection) {
    let timer = null;
    let told = false;
    const back = () => {
      if (timer) { clearTimer(timer); timer = null; }
      if (told) {
        told = false;
        alert("db-back", "عاد الاتصال بقاعدة البيانات", `عاد اتصال الخادم بقاعدة البيانات في ${stamp(now())}.`, { throttle: false });
      }
    };
    connection.on("disconnected", () => {
      if (timer || told) return;
      const since = now();
      timer = setTimer(() => {
        timer = null;
        told = true;
        alert("db-down", "انقطع الاتصال بقاعدة البيانات", [
          `انقطع اتصال خادم تمهيد بقاعدة البيانات منذ ${stamp(since)}.`,
          "المستخدمون لا يستطيعون الحفظ أو القراءة حتى يعود الاتصال.",
          "ستصلك رسالة أخرى عند عودته.",
        ].join("\n"));
      }, DB_GRACE_MS);
    });
    connection.on("connected", back);
    connection.on("reconnected", back);
  }

  return { recordCrash, onStartup, watchDb, alert };
}

// GET /api/health: 200 while the database is connected, 503 otherwise, so an
// outside check (and deploy/update.sh) sees a server that cannot work.
function healthHandler(connection) {
  return (req, res) => {
    const up = connection?.readyState === 1;
    return res.status(up ? 200 : 503).json({ ok: up, db: up ? "up" : "down", ts: Date.now() });
  };
}

module.exports = { createOpsAlerts, opsAlerts: createOpsAlerts(), healthHandler, THROTTLE_MS, DB_GRACE_MS };
