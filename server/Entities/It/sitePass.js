// Moving between the sites (IT-site design, "Moving between the sites"): a
// one-time pass for the signed-in user, random, 60 seconds, usable once,
// bound to that user and to the direction. The password never travels; the
// two sessions stay separate.
const crypto = require("crypto");
const { SitePassModelDef } = require("./SitePass.model");
const { sha256 } = require("../../utils/jwt");
const { isSystemTz, resolveRole } = require("../../utils/permissions");
const { mayUseIt, itSecret } = require("../../middleware/requireIt");
const { audit: defaultAudit } = require("../../utils/audit");
const { logWithSource } = require("../../middleware/logger");
const defaultItAuth = require("./It.auth");
const { GENERIC_LOGIN_MESSAGE } = defaultItAuth;

const PASS_TTL_MS = 60 * 1000;
const TO_IT = "it";
const TO_SYSTEM = "system";

const FORBIDDEN = { ok: false, code: "FORBIDDEN", message: "لا توجد صلاحية" };
const BAD_PASS = { ok: false, code: "BAD_PASS", message: "انتهت صلاحية الانتقال، سجّل الدخول من جديد" };
const SERVER_ERROR = { ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" };

const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);

// Loaded on first use, so requiring this file does not pull in the controller.
const defaultSignInEveryday = (req, res, user, room) =>
  require("../User/User.controller").signInWithoutPassword(req, res, user, room);
const defaultUsers = () => require("../User/User.model").UserModelDef;

// Dependencies are injectable so the flow can be tested without a database.
function createSitePasses(deps = {}) {
  const {
    passes = SitePassModelDef,
    users,
    itAuth = defaultItAuth,
    signInEveryday = defaultSignInEveryday,
    audit = defaultAudit,
    makePass = () => crypto.randomBytes(32).toString("base64url"),
    systemTz = () => process.env.SYSTEM_ADMIN_TZ,
    log = logWithSource,
    now = () => Date.now(),
  } = deps;

  const issue = async (tz, to) => {
    const pass = makePass();
    await passes.create({ hash: sha256(pass), tz: String(tz), to, expiresAt: new Date(now() + PASS_TTL_MS) });
    return pass;
  };

  // The user's tz, or null. Any pass shown is spent, also one shown to the
  // wrong site; only the request whose delete removed it may use it.
  const use = async (pass, to) => {
    if (typeof pass !== "string" || !pass) return null;
    const hash = sha256(pass);
    const row = rows(await passes.get({ hash }))[0];
    if (!row) return null;
    const used = await passes.delete({ hash });
    if (Number(used?.result?.deletedCount) !== 1) return null;
    if (row.to !== to || new Date(row.expiresAt).getTime() <= now()) return null;
    return String(row.tz);
  };

  const findActiveUser = async (tz) => {
    const found = rows(await (users || defaultUsers()).get({ tz }, "active"));
    return found.length === 1 ? found[0] : null;
  };

  const recordUse = (req, tz, action) => audit.record(
    { actor: { tz, isSystem: isSystemTz(tz, systemTz()) }, ip: req.ip },
    { module: "it", action, targetType: "user", targetId: tz },
  );

  // Both sides (IT-site design): IT, not blocked, and an everyday role. The
  // system account holds no everyday role, so it gets no pass either way.
  const hasBothSides = (user, isSystem) => mayUseIt(user, isSystem) && Boolean(resolveRole(user));

  // POST /api/auth/it-pass (everyday requireAuth + loadActor): only a user
  // with both sides.
  const itPass = async (req, res) => {
    try {
      const { tz, isSystem, user } = req.actor || {};
      if (!tz || !hasBothSides(user, isSystem === true)) return res.status(403).json(FORBIDDEN);
      return res.json({ ok: true, pass: await issue(tz, TO_IT) });
    } catch (err) {
      log("SitePass.itPass", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  // POST /api/it/system-pass (requireIt): only a user with both sides.
  const systemPass = async (req, res) => {
    try {
      const { tz, isSystem, user } = req.actor || {};
      if (!tz || !hasBothSides(user, isSystem === true)) return res.status(403).json(FORBIDDEN);
      return res.json({ ok: true, pass: await issue(tz, TO_SYSTEM) });
    } catch (err) {
      log("SitePass.systemPass", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  // POST /api/it/login-pass { pass }: the pass replaces the password step
  // only; the email code is still sent and asked, through the same gates as
  // POST /api/it/login. The same answer as login, plus the tz the code step
  // needs when the pass was good.
  const loginToIt = async (req, res) => {
    const generic = (extra = {}) => res.json({ ok: true, message: GENERIC_LOGIN_MESSAGE, ...extra });
    try {
      // Fails closed before the pass is spent or a use is audited.
      itSecret();
      const tz = await use(req.body?.pass, TO_IT);
      if (!tz) return generic();
      await recordUse(req, tz, "pass_to_it");
      await itAuth.sendCodeWithoutPassword(tz);
      return generic({ tz });
    } catch (err) {
      log("SitePass.loginToIt", err);
      return generic();
    }
  };

  // POST /api/auth/login-pass { pass }: the pass is enough, no code; the
  // everyday sign-in answer, as after a password login.
  const loginToSystem = async (req, res) => {
    try {
      const tz = await use(req.body?.pass, TO_SYSTEM);
      if (!tz) return res.status(401).json(BAD_PASS);
      const user = await findActiveUser(tz);
      if (!user) return res.status(401).json(BAD_PASS);
      await recordUse(req, tz, "pass_to_system");
      return await signInEveryday(req, res, user, "active");
    } catch (err) {
      log("SitePass.loginToSystem", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  return { issue, use, itPass, systemPass, loginToIt, loginToSystem };
}

module.exports = {
  ...createSitePasses(),
  createSitePasses,
  PASS_TTL_MS,
  TO_IT,
  TO_SYSTEM,
};
