const { UserModelDef } = require("../Entities/User/User.model");
const { ensureUserStorageFolder } = require("../Entities/Storage/Storage.controller");
const { systemEmailWarning, passwordChangedAtPatch } = require("../utils/systemPassword");
const { smtpConfigured } = require("../utils/sendEmail");

// A date the 30-day rule always treats as expired: the first sign-in must
// choose a new password (the bootstrap password lives in the env file).
const FORCE_CHANGE = () => new Date(0);

const SYSTEM_ADMIN_TZ = String(process.env.SYSTEM_ADMIN_TZ || "").trim();
const SYSTEM_ADMIN_PASSWORD = String(process.env.SYSTEM_ADMIN_PASSWORD || "").trim();
const SYSTEM_ADMIN_FIRSTNAME = String(process.env.SYSTEM_ADMIN_FIRSTNAME || "System").trim();
const SYSTEM_ADMIN_LASTNAME = String(process.env.SYSTEM_ADMIN_LASTNAME || "Admin").trim();
const SYSTEM_ADMIN_EMAIL = String(process.env.SYSTEM_ADMIN_EMAIL || "system-admin@tamheed.local").trim();
const SYSTEM_ADMIN_PHONE = String(process.env.SYSTEM_ADMIN_PHONE || "").trim();
const SYSTEM_ADMIN_CITY = String(process.env.SYSTEM_ADMIN_CITY || "").trim();
const SYSTEM_ADMIN_STREET = String(process.env.SYSTEM_ADMIN_STREET || "").trim();
const SYSTEM_ADMIN_GENDER = String(process.env.SYSTEM_ADMIN_GENDER || "ذكر").trim();
const SYSTEM_ADMIN_STORAGE_FOLDER = String(process.env.SYSTEM_ADMIN_STORAGE_FOLDER || "system-admin").trim();

async function safeEnsureUserStorageFolder(user) {
  try {
    await ensureUserStorageFolder(user);
  } catch (error) {
    console.warn(
      `Skipping storage folder provisioning for system admin (remote storage unreachable): ${error.message}`
    );
  }
}

async function findUserByTzInRoom(tz, room) {
  const response = await UserModelDef.get({ tz }, room);
  if (response?.success && Array.isArray(response.result) && response.result.length > 0) {
    return response.result[0];
  }

  return null;
}

async function ensureSystemAdmin() {
  if (!SYSTEM_ADMIN_TZ || !SYSTEM_ADMIN_PASSWORD) {
    console.warn("Skipping system admin bootstrap because SYSTEM_ADMIN_TZ or SYSTEM_ADMIN_PASSWORD is missing.");
    return { ok: false, reason: "missing-config" };
  }

  // Recovery and alert emails go only to this mailbox (spec الجزء 6).
  const emailWarning = systemEmailWarning(SYSTEM_ADMIN_EMAIL);
  if (emailWarning) console.warn(emailWarning);
  if (!smtpConfigured()) {
    console.warn("SMTP is not configured (SMTP_SERVER, SMTP_PORT, SMTP_FROM): system account recovery, reset codes "
      + "and alert emails cannot be sent. Configure SMTP in server/config/.env and restart.");
  }

  const [activeUser, waitingUser, inactiveUser] = await Promise.all([
    findUserByTzInRoom(SYSTEM_ADMIN_TZ, "active"),
    findUserByTzInRoom(SYSTEM_ADMIN_TZ, "waiting"),
    findUserByTzInRoom(SYSTEM_ADMIN_TZ, "noActive"),
  ]);

  if (activeUser) {
    const patch = {
      firstname: SYSTEM_ADMIN_FIRSTNAME,
      lastname: SYSTEM_ADMIN_LASTNAME,
      email: SYSTEM_ADMIN_EMAIL,
      phone: SYSTEM_ADMIN_PHONE,
      city: SYSTEM_ADMIN_CITY,
      street: SYSTEM_ADMIN_STREET,
      gender: SYSTEM_ADMIN_GENDER,
      roles: ["ادارة"],
      storageFolder: activeUser.storageFolder || SYSTEM_ADMIN_STORAGE_FOLDER,
      // An account without a valid date must change its password at the
      // next sign-in; a valid date is kept.
      ...passwordChangedAtPatch(activeUser, FORCE_CHANGE()),
    };

    await UserModelDef.update({ tz: SYSTEM_ADMIN_TZ }, patch, "active");
    await safeEnsureUserStorageFolder({ ...activeUser, ...patch, tz: SYSTEM_ADMIN_TZ });

    console.log(`System admin already exists and was normalized: ${SYSTEM_ADMIN_TZ}`);
    return { ok: true, created: false, room: "active" };
  }

  if (waitingUser || inactiveUser) {
    const existingRoom = waitingUser ? "waiting" : "noActive";
    console.warn(`System admin TZ ${SYSTEM_ADMIN_TZ} already exists in room "${existingRoom}". Move it to active manually if needed.`);
    return { ok: false, reason: "exists-in-other-room", room: existingRoom };
  }

  const payload = {
    tz: SYSTEM_ADMIN_TZ,
    password: SYSTEM_ADMIN_PASSWORD,
    firstname: SYSTEM_ADMIN_FIRSTNAME,
    lastname: SYSTEM_ADMIN_LASTNAME,
    email: SYSTEM_ADMIN_EMAIL,
    phone: SYSTEM_ADMIN_PHONE,
    city: SYSTEM_ADMIN_CITY,
    street: SYSTEM_ADMIN_STREET,
    gender: SYSTEM_ADMIN_GENDER,
    roles: ["ادارة"],
    storageFolder: SYSTEM_ADMIN_STORAGE_FOLDER,
    passwordChangedAt: FORCE_CHANGE(),
  };

  await UserModelDef.create(payload, "active");
  await safeEnsureUserStorageFolder(payload);

  console.log(`System admin user created successfully: ${SYSTEM_ADMIN_TZ}`);
  return { ok: true, created: true, room: "active" };
}

module.exports = { ensureSystemAdmin };
