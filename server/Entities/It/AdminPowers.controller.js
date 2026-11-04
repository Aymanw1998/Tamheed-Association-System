const { actorDisplayName } = require("../../utils/permissions");
const { adminPowersOn, setAdminPowers } = require("../../utils/permissionRules");
const { logWithSource } = require("../../middleware/logger");

const KEY = "adminPowers";
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

// IT's switch for what administrators may do with the staff (owner,
// 2026-11-04): permissionRules.js holds the rules, this holds the state.
// deps (tests): model, audit, now.
function createAdminPowers(deps = {}) {
  const {
    model = require("./ItSetting.model").ItSettingModelDef,
    audit = require("../../utils/audit").audit,
    now = () => new Date(),
  } = deps;

  // At start. With no row the powers stay on; if the state cannot be read they
  // are off, so a stored "off" is never lost to a failed read.
  const load = async () => {
    try {
      const row = await model.readKey(KEY);
      if (typeof row?.enabled === "boolean") setAdminPowers(row.enabled);
    } catch (err) {
      setAdminPowers(false);
      logWithSource("AdminPowers.load", err);
    }
  };

  // GET /admin-powers
  const get = async (_req, res) => res.status(200).json({ ok: true, enabled: adminPowersOn() });

  // PUT /admin-powers { enabled }
  const put = async (req, res) => {
    try {
      const enabled = req.body?.enabled;
      if (typeof enabled !== "boolean") return res.status(400).json({ ok: false, code: "BAD_SETTING" });
      const before = adminPowersOn();
      await model.write(KEY, { enabled, updatedAt: now(), updatedBy: actorDisplayName(req.actor) });
      setAdminPowers(enabled);
      await audit.record(req, {
        module: "permissions", action: "admin_powers_change", targetType: "setting", targetId: KEY, targetLabel: KEY,
        before: { enabled: before }, after: { enabled },
      });
      return res.status(200).json({ ok: true, enabled });
    } catch (err) {
      logWithSource("AdminPowers.put", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  return { load, get, put };
}

// The one the server uses, made on first use.
let shared = null;
const adminPowers = () => shared || (shared = createAdminPowers());

module.exports = { createAdminPowers, adminPowers };
