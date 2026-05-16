const { UserModelDef } = require("../Entities/User/User.model");
const { ensureUserStorageFolder } = require("../Entities/Storage/Storage.controller");

const SYSTEM_ADMIN_TZ = String(process.env.SYSTEM_ADMIN_TZ || "000000000").trim();
const SYSTEM_ADMIN_PASSWORD = String("123").trim();
const SYSTEM_ADMIN_FIRSTNAME = String(process.env.SYSTEM_ADMIN_FIRSTNAME || "System").trim();
const SYSTEM_ADMIN_LASTNAME = String(process.env.SYSTEM_ADMIN_LASTNAME || "Admin").trim();
const SYSTEM_ADMIN_EMAIL = String(process.env.SYSTEM_ADMIN_EMAIL || "system-admin@tamheed.local").trim();
const SYSTEM_ADMIN_PHONE = String(process.env.SYSTEM_ADMIN_PHONE || "").trim();
const SYSTEM_ADMIN_CITY = String(process.env.SYSTEM_ADMIN_CITY || "").trim();
const SYSTEM_ADMIN_STREET = String(process.env.SYSTEM_ADMIN_STREET || "").trim();
const SYSTEM_ADMIN_GENDER = String(process.env.SYSTEM_ADMIN_GENDER || "ذكر").trim();
const SYSTEM_ADMIN_STORAGE_FOLDER = String(process.env.SYSTEM_ADMIN_STORAGE_FOLDER || "system-admin").trim();

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
    };

    await UserModelDef.update({ tz: SYSTEM_ADMIN_TZ }, patch, "active");
    await ensureUserStorageFolder({ ...activeUser, ...patch, tz: SYSTEM_ADMIN_TZ });

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
  };

  await UserModelDef.create(payload, "active");
  await ensureUserStorageFolder(payload);

  console.log(`System admin user created successfully: ${SYSTEM_ADMIN_TZ}`);
  return { ok: true, created: true, room: "active" };
}

module.exports = { ensureSystemAdmin };
