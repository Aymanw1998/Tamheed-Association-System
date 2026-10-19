// IT recovery for the system account: "npm run system:recover".
// Run on the server by someone with access to it, when nobody can sign in as
// the system account. Sets a temporary password, emails it to
// SYSTEM_ADMIN_EMAIL (from server/config/.env) and forces a change at the next
// sign-in. Unlike the in-app recovery, it does not need 3 failed sign-ins.
// It prints only "sent to <masked email>": the password is never printed.
//
// Lost mailbox: edit SYSTEM_ADMIN_EMAIL in server/config/.env, restart the
// server (ensureSystemAdmin copies it to the account), then run this script.
const path = require("path");
const { isUsableSystemEmail, maskEmail, resetSystemPassword } = require("../utils/systemPassword");

// Stored in the audit log as actor "it-server" / "IT (خادم)".
const IT_ACTOR = Object.freeze({ tz: "it-server", name: "IT (خادم)" });

async function findSystemUser(model, systemTz) {
  const response = await model.get({ tz: systemTz }, "active");
  if (response?.success && Array.isArray(response.result) && response.result.length > 0) {
    return response.result[0];
  }
  return null;
}

async function systemRecover({ model, systemTz, email, send, encrypt, audit }) {
  const tz = String(systemTz ?? "").trim();
  if (!tz) return { ok: false, reason: "no-system-tz" };
  if (!isUsableSystemEmail(email)) return { ok: false, reason: "email-not-configured" };

  const user = await findSystemUser(model, tz);
  if (!user) return { ok: false, reason: "no-system-account" };

  const { before, after } = await resetSystemPassword({ user, model, email, send, encrypt });
  await audit.record({ actor: { ...IT_ACTOR } }, {
    module: "users", action: "system_recovery", targetType: "user",
    targetId: user.tz, targetLabel: "", before, after,
  });
  return { ok: true, maskedEmail: maskEmail(email) };
}

const MESSAGES = {
  "no-system-tz": "SYSTEM_ADMIN_TZ is not set in server/config/.env. Nothing was changed.",
  "email-not-configured":
    "SYSTEM_ADMIN_EMAIL is blank or a placeholder (.local). Set a real mailbox in server/config/.env. Nothing was changed.",
  "no-system-account": "The system account was not found in the active users. Nothing was changed.",
  "smtp-not-configured": "SMTP_SERVER / SMTP_PORT / SMTP_FROM are not set. Nothing was changed.",
};

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const { smtpConfigured, sendSystemAdminEmail } = require("../utils/sendEmail");
  if (!smtpConfigured()) {
    console.error(MESSAGES["smtp-not-configured"]);
    return 1;
  }
  const { UserModelDef } = require("../Entities/User/User.model");
  const { encryptPassword } = require("../Entities/User/passwordCrypto");
  const { audit } = require("../utils/audit");

  const result = await systemRecover({
    model: UserModelDef,
    systemTz: process.env.SYSTEM_ADMIN_TZ,
    email: String(process.env.SYSTEM_ADMIN_EMAIL || "").trim(),
    send: sendSystemAdminEmail,
    encrypt: encryptPassword,
    audit,
  });
  if (!result.ok) {
    console.error(MESSAGES[result.reason] || "Nothing was changed.");
    return 1;
  }
  console.log(`sent to ${result.maskedEmail}`);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      // No err.message: a mail error can echo the address.
      console.error(`System recovery failed (${err?.code || err?.name || "error"}). If the email was not sent, nothing was changed.`);
      process.exit(1);
    });
}

module.exports = { systemRecover, IT_ACTOR };
