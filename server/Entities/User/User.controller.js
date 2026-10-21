const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const { UserModelDef } = require("./User.model");

const sendEmail = require("../../utils/sendEmail");
const { sendResetPasswordEmail } = sendEmail;
const {
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  sha256,
  computeAccessExpMsFromNow,
} = require("../../utils/jwt");

const {
  LOCK_THRESHOLD,
  LOCKED_MESSAGE,
  isLocked,
  afterFailureCount,
  afterSuccess,
} = require("../../utils/loginLockout");

const {
  ROLE_DEFAULTS,
  ROLE_RANK,
  isSystemTz,
  actorRef,
  can,
  effectivePermissions,
  expandKeys,
  normalizeRole,
  resolveRole,
} = require("../../utils/permissions");
const {
  canManageTarget,
  grantableBy,
  validatePermissionChange,
  canAssignRole,
  applyRoleChange,
} = require("../../utils/permissionRules");
const {
  PASSWORD_CHANGE_SCOPE,
  PASSWORD_CHANGE_TOKEN_TTL_SEC,
  RECOVERY_MIN_FAILURES,
  mustChangePassword,
  tokenIsStale,
  recoveryCoolingDown,
  newPasswordProblem,
  passwordProblemMessage,
  isUsableSystemEmail,
  lockoutAlertEmail,
  resetSystemPassword,
} = require("../../utils/systemPassword");
const { logWithSource } = require("../../middleware/logger");
const { isValidIsraeliId } = require("../../utils/israeliId");
const { tourSummary } = require("../../utils/tourState");

const {
  encryptPassword,
  decryptPassword,
  isEncrypted,
  safeEqual,
} = require("./passwordCrypto");
const { handleUpload, handleDeleteByUrl } = require("../UploadFile/file");
const { audit } = require("../../utils/audit");
const {
  buildUserStorageFolder,
  ensureUserStorageFolder,
  syncStorageViewPermissionsForUser,
} = require("../Storage/Storage.controller");

/* ================= Notifications (optional) ================= */
let notify = null;
try {
  ({ notify } = require("../Notification/Notification.controller"));
} catch (e) {
  notify = null;
}

const safeNotify = async (payload) => {
  try {
    if (typeof notify === "function") await notify(payload);
  } catch (e) {
    logWithSource("User.safeNotify", e);
  }
};

/* ================= Smart-assistant alerts ================= */
// Fire-and-forget: never awaited, errors only logged, so an alert can neither
// slow down nor break the action. Loaded on use (a load failure is logged).
const raiseAlert = (event, ...args) => {
  Promise.resolve()
    .then(() => require("../../services/alertEvents")[event](...args))
    .catch((error) => logWithSource(`User.alert.${event}`, error));
};
// Only what an alert text needs; never a password or a token.
const alertPerson = (user = {}) => ({ tz: user.tz, firstname: user.firstname || "", lastname: user.lastname || "" });

const safeEnsureStorageFolder = async (user) => {
  try {
    await ensureUserStorageFolder(user);
  } catch (error) {
    logWithSource("User.ensureStorageFolder", error);
  }
};

const safeSyncStoragePermissions = async (user) => {
  try {
    await syncStorageViewPermissionsForUser(user);
  } catch (error) {
    logWithSource("User.syncStoragePermissions", error);
  }
};

/* ================= Audit log ================= */
// Users are tracked by ID number (tz): their _id changes when they move rooms.
const recordUser = (req, action, before, after) => {
  const doc = after || before || {};
  return audit.record(req, {
    module: "users", action, targetType: "user",
    targetId: doc.tz,
    targetLabel: `${doc.firstname || ""} ${doc.lastname || ""}`.trim() || String(doc.tz || ""),
    before, after,
  });
};

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// One row per save. Roles and grants have their own endpoints; folder
// permissions can still arrive through putU.
function userEditAction(before = {}, patch = {}) {
  const changed = (field) => Object.prototype.hasOwnProperty.call(patch, field) && !sameValue(before?.[field], patch[field]);
  return changed("storagePermissions") ? "permission_change" : "update";
}

const FORBIDDEN_BODY = { code: "FORBIDDEN", message: "لا توجد صلاحية" };
const forbidden = (res) => res.status(403).json(FORBIDDEN_BODY);
const notFound = (res) => res.status(404).json({ ok: false, message: "غير موجود" });
const invalid = (res, code) => res.status(400).json({ ok: false, code });

// The system account is invisible to these endpoints: it answers as missing.
const isSystemUser = (user) => Boolean(user) && isSystemTz(user.tz);

// Who changed permissions last; the system account's tz is never stored.
const permissionEditor = (actor) => actorRef(actor, String(actor?.tz || ""));

// Roles, grants, lockout and session state are server-owned: putU never takes
// them from a request body (roles: PUT /:tz/role, grants: PUT /:tz/permissions).
const SERVER_OWNED_FIELDS = [
  "role", "roles", "permissionGrants", "permissionRevokes", "vehiclePermissions",
  "permissionsUpdatedAt", "permissionsUpdatedBy",
  // A user is never renamed, and the folder and Drive link are server-derived.
  "tz", "storageFolder", "googleDrive",
  "failedLoginCount", "lockedAt", "passwordChangedAt", "recoveredAt",
  "refreshHash", "resetOtpHash", "resetOtpExpires", "resetOtpAttempts", "resetOtpLockedUntil",
  "tours", "knownKeys", "seenReleases",
];
const stripServerOwned = (data) => {
  for (const field of SERVER_OWNED_FIELDS) delete data[field];
  return data;
};

const uniqueStrings = (list) => [...new Set(list)];

// A new account's ID number (already trimmed by buildData) must be a valid
// Israeli ID and never the system account's.
function newTzProblem(tz) {
  if (!isValidIsraeliId(tz)) return "INVALID_TZ";
  if (isSystemTz(tz)) return "SYSTEM_TZ";
  return null;
}

// The storage folder and Drive link of a new account are never taken from a
// request body: the folder is always derived from the tz.
function deriveServerFields(model) {
  delete model.storageFolder;
  delete model.googleDrive;
  model.storageFolder = buildUserStorageFolder(model);
  return model;
}
const symmetricDifference = (a, b) => {
  const left = new Set(a);
  const right = new Set(b);
  return [...a.filter((x) => !right.has(x)), ...b.filter((x) => !left.has(x))];
};

// req.actor comes from permissionMiddleware.loadActor. Self means the same tz
// (the update filters below are by tz).
const isSelfTz = (req, tz) => {
  const own = String(req.actor?.tz ?? "").trim();
  return Boolean(own) && own === String(tz ?? "").trim();
};

// Oneself, or (with users.edit) a user the actor may manage.
const canManageUserMedia = (req, user) =>
  isSelfTz(req, user?.tz)
  || (can(req.actor?.permissions, "users.edit") && canManageTarget(req.actor, user));

const buildUserPhotoName = (user = {}, file = {}) => {
  const parts = [
    user.firstname,
    user.lastname,
    user.tz,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const baseName = parts.join("-") || String(user.tz || "user");
  const ext = path.extname(file.originalname || "") || "";

  return `${baseName}${ext}`;
};

/* ================= System account mailbox ================= */
// SYSTEM_ADMIN_EMAIL lives only in the server env. Null when it cannot be used.
function systemMailbox() {
  const email = String(process.env.SYSTEM_ADMIN_EMAIL || "").trim();
  if (!isUsableSystemEmail(email)) return null;
  if (typeof sendEmail.smtpConfigured === "function" && !sendEmail.smtpConfigured()) return null;
  return email;
}

// Every 5th consecutive failure on the system account (spec الجزء 6). Never
// throws: a failed alert must not change the sign-in answer.
async function sendLockoutAlert(failedLoginCount) {
  try {
    const to = systemMailbox();
    if (!to) {
      logWithSource("User.lockoutAlert", new Error("SYSTEM_ADMIN_EMAIL or SMTP not configured; alert not sent"));
      return;
    }
    await sendEmail.sendSystemAdminEmail(to, lockoutAlertEmail(failedLoginCount));
  } catch (error) {
    logWithSource("User.lockoutAlert", error);
  }
}

// A wrong password (sign-in or change-password): atomic +1, lock at 5 for
// everyone but the system account, alert email every 5th for the system
// account. Never throws.
async function countFailedSignIn(req, user, room, isSystem) {
  try {
    const counted = await UserModelDef.incrementFailedLogin(user.tz, room);
    const { lockedAt, alertSystem } = afterFailureCount(counted?.result?.failedLoginCount, {
      isSystem,
      lockedAt: counted?.result?.lockedAt,
      now: new Date(),
    });
    // The count comes from an atomic increment, so exactly one request sees
    // each multiple of 5. Not awaited: SMTP must not delay the answer.
    if (alertSystem) {
      void sendLockoutAlert(counted?.result?.failedLoginCount);
      raiseAlert("systemLoginFailures", Number(counted?.result?.failedLoginCount) || 0);
    }
    if (lockedAt && !isSystem) {
      const locked = await UserModelDef.lockIfThresholdReached(user.tz, lockedAt, LOCK_THRESHOLD, room);
      // Only the request that actually set the lock records it.
      if (locked?.result) {
        await recordUser({ actor: { isSystem: true }, ip: req.ip }, "lock",
          { tz: user.tz, firstname: user.firstname, lastname: user.lastname, lockedAt: null },
          { tz: user.tz, firstname: user.firstname, lastname: user.lastname, lockedAt: locked.result.lockedAt ?? lockedAt });
        raiseAlert("accountLocked", alertPerson(user));
      }
    }
  } catch (countError) {
    logWithSource("User.countFailedSignIn", countError);
  }
}

const staleResponse = (res) =>
  res.status(401).json({ code: "TOKEN_STALE", message: "انتهت الجلسة بعد تغيير كلمة المرور" });

// A full session (access token + refresh cookie) for a user in the active room.
async function issueSession(res, user) {
  const claims = { id: user._id?.toString?.() || String(user._id || ""), tz: user.tz, roles: user.roles || [], room: "active" };
  const accessToken = signAccessToken(claims);
  const refreshToken = signRefreshToken(claims);
  await UserModelDef.update({ tz: user.tz }, { refreshHash: sha256(refreshToken) }, "active");
  setRefreshCookie(res, refreshToken);
  return { accessToken, expirationTime: computeAccessExpMsFromNow() };
}

/* ================= Constants ================= */
const ROOMS = ["active", "waiting", "noActive"];
// No "password": one's own password changes only through
// POST /api/auth/change-password (current password required).
const SELF_EDIT_FIELDS = new Set([
  "firstname", "lastname", "birth_date", "gender", "phone", "email",
  "city", "street", "photo",
]);
const MAX_ATTEMPTS = 5;
const LOCK_MIN = 10;

/* ================= Helpers ================= */
const lockedResponse = (res) =>
  res.status(423).json({ code: "ACCOUNT_LOCKED", message: LOCKED_MESSAGE });

function sanitize(u) {
  if (!u) return u;
  const o = { ...u };
  delete o.password;
  delete o.refreshHash;
  delete o.resetOtpHash;
  delete o.tours;
  delete o.knownKeys;
  delete o.seenReleases;
  return o;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);

  if (typeof value === "string") {
    const s = value.trim();

    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    const ts = Date.parse(s);
    if (!Number.isNaN(ts)) return new Date(ts);
  }

  return null;
}

function buildData(body = {}) {
  return {
    // Trimmed, so " 123" can never be stored next to (or as) "123".
    tz: body.tz == null ? undefined : String(body.tz).trim(),
    firstname: body.firstname,
    lastname: body.lastname,
    birth_date: toDate(body.birth_date) || null,
    gender: body.gender,
    phone: body.phone,
    email: body.email,
    city: body.city,
    street: body.street,
    password: body.password,
    main_lesson: body.main_lesson ?? null,
    storageFolder: body.storageFolder,
    // Kept only for actors holding files.manageAll (dropStorageUnlessAllowed).
    storagePermissions: body.storagePermissions,

    photo: body.photo,
    googleDrive: body.googleDrive,
  };
}

// Folder permissions follow the PATCH /storage-permissions rule.
function dropStorageUnlessAllowed(req, data) {
  if (!can(req.actor?.permissions, "files.manageAll")) delete data.storagePermissions;
  return data;
}

function removeEmpty(obj = {}) {
  const out = { ...obj };
  Object.keys(out).forEach((k) => {
    if (out[k] === undefined || out[k] === null || out[k] === "") {
      delete out[k];
    }
  });
  return out;
}

function generateOtp6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const isBcryptHash = (val) =>
  typeof val === "string" && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

async function getUserInRoomByTz(tz, room) {
  try{
    const result = await UserModelDef.get({ tz }, room).catch(() => null);
    const result2 = await UserModelDef.get({ _id: tz }, room).catch(() => null);
    if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
      return result.result[0];
    }
    if (result2?.success && Array.isArray(result2.result) && result2.result.length > 0) {
      return result2.result[0];
    }
    return null;
  } catch (error) {
    logWithSource("User.getUserInRoomByTz", error);
    return null;
  }
}

async function findUserAcrossRooms(tz) {
  for (const room of ROOMS) {
    const user = await getUserInRoomByTz(tz, room);
    if (user) return { user, room };
  }
  return { user: null, room: null };
}

// One person, one record: "012345674" and "12345674" are the same ID number,
// so existence checks ignore leading zeros on both sides (storage is unchanged).
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function sameTzFilter(tz) {
  const digits = String(tz ?? "").trim().replace(/^0+/, "");
  return { tz: { $regex: `^0*${escapeRegex(digits)}$` } };
}

// A failed read throws: treating it as "absent" would let a duplicate through.
async function tzExistsInRoom(tz, room) {
  const found = await UserModelDef.get(sameTzFilter(tz), room);
  return Boolean(found?.success && Array.isArray(found.result) && found.result.length > 0);
}

// The first room holding this ID number (any spelling), or null.
async function roomHoldingTz(tz) {
  for (const room of ROOMS) if (await tzExistsInRoom(tz, room)) return room;
  return null;
}

async function findUsersByEmail(email) {
  // Addresses are stored as typed, so a lowercase spelling has to be tried too.
  const spellings = [...new Set([email, email.toLowerCase()])];
  const matches = [];

  for (const spelling of spellings) {
    for (const room of ROOMS) {
      try {
        const result = await UserModelDef.get({ email: spelling }, room).catch(() => null);
        if (result?.success && Array.isArray(result.result)) {
          for (const user of result.result) matches.push({ user, room });
        }
      } catch (error) {
        logWithSource("User.findUsersByEmail", error);
      }
    }
    if (matches.length) break;
  }

  return matches;
}

async function verifyPasswordAndMaybeUpgrade(userDoc, room, inputPassword) {
  try {
    const stored = userDoc?.password;
    if (!stored || typeof stored !== "string") return { ok: false };

    // old bcrypt
    if (isBcryptHash(stored)) {
      const ok = await bcrypt.compare(inputPassword, stored);
      if (!ok) return { ok: false };

      try {
        const encPassword = encryptPassword(inputPassword);
        await UserModelDef.update(
          { tz: userDoc.tz },
          { password: encPassword },
          room
        );
        return { ok: true, upgraded: true };
      } catch (upgradeError) {
        // The password was correct; a failed re-save must not count as a failure.
        logWithSource("User.verifyPasswordAndMaybeUpgrade.upgrade", upgradeError);
        return { ok: true, upgraded: false };
      }
    }

    // new enc
    if (isEncrypted(stored)) {
      try {
        const plain = decryptPassword(stored);
        const ok = safeEqual(inputPassword, plain);
        return { ok };
      } catch {
        return { ok: false };
      }
    }

    return { ok: false };
  } catch (error) {
    logWithSource("User.verifyPasswordAndMaybeUpgrade", error);
    return { ok: false };
  }
}

/* ================= CRUD ================= */
const getAllU = async (req, res) => {
  try {
    const rooms =
      Array.isArray(req.body?.rooms) && req.body.rooms.length
        ? req.body.rooms
        : ROOMS;

    let users = [];

    for (const room of rooms) {
      if (!ROOMS.includes(room)) continue;

      const result = await UserModelDef.get({}, room);

      if (result?.success && Array.isArray(result.result)) {
        users = users.concat(
          // The system account is never listed.
          result.result.filter((u) => !isSystemUser(u)).map((u) => ({
            ...sanitize(u),
            room,
          }))
        );
      }
    }

    return res.status(200).json({
      ok: true,
      users,
    });
  } catch (err) {
    logWithSource("User.getAllU", err);
    return res.status(500).json({
      ok: false,
      users: [],
      message: err.message,
    });
  }
};

const getOneU = async (req, res) => {
  try {
    const tzOrId = String(req.params.tz ?? "").trim();
    if (!tzOrId) {
      return res.status(400).json({ ok: false, message: "tz required" });
    }

    for (const room of ROOMS) {
      const result = await UserModelDef.get({ tz: tzOrId }, room).catch(() => null);
      const result2 = await UserModelDef.get({ _id: tzOrId }, room).catch(() => null);
      const found = [result, result2]
        .map((r) => (r?.success && Array.isArray(r.result) ? r.result[0] : null))
        .find(Boolean);
      if (found) {
        // The system account answers as missing to everyone but itself.
        if (isSystemUser(found) && !isSelfTz(req, found.tz)) break;
        const user = sanitize(found);
        if (
          can(req.actor?.permissions, "users.edit")
          && canManageTarget(req.actor, found)
          && !isSystemUser(found)
        ) {
          user.tourSummary = tourSummary(found.tours || {});
        }
        return res.status(200).json({ ok: true, user, room });
      }
    }

    return res.status(404).json({
      ok: false,
      message: "غير موجود",
    });
  } catch (err) {
    logWithSource("User.getOneU", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

// A first role for a user who has none (approval, or a new account). A role
// manager (or the system) follows the PUT /:tz/role rule; otherwise the actor
// needs `gateKey` and may give only a role ranked strictly below his own whose
// every default leaf he holds.
function canGiveFirstRole(actor, target, role, gateKey) {
  if (canAssignRole(actor, target, role)) return true;
  if (resolveRole(target)) return false;
  const held = actor?.permissions;
  if (!can(held, gateKey) || !canManageTarget(actor, target)) return false;
  const actorRank = ROLE_RANK[resolveRole(actor)] || 0;
  if (!(ROLE_RANK[role] < actorRank)) return false;
  for (const leaf of expandKeys(ROLE_DEFAULTS[role])) if (!held.has(leaf)) return false;
  return true;
}

const postU = async (req, res) => {
  try {
    const model = dropStorageUnlessAllowed(req, buildData(req.body));
    const tzProblem = newTzProblem(model.tz);
    if (tzProblem === "INVALID_TZ") {
      return res.status(400).json({ ok: false, code: "INVALID_TZ", message: "رقم الهوية غير صالح" });
    }
    if (tzProblem) return res.status(409).json({ ok: false, message: "المستخدم موجود" });

    // A role on creation follows the approval rule (canGiveFirstRole), with
    // the new user as a rank-0, non-system target. Grants are set later,
    // through PUT /:tz/permissions.
    const body = req.body || {};
    const submitted = [body.role, ...(Array.isArray(body.roles) ? body.roles : [])]
      .filter((r) => !(r == null || (typeof r === "string" && r.trim() === "")));
    if (submitted.some((r) => !normalizeRole(r))) return invalid(res, "UNKNOWN_ROLE");
    const role = resolveRole({ roles: submitted });
    if (role && !canGiveFirstRole(req.actor, {}, role, "users.create")) return forbidden(res);
    Object.assign(model, { role: role || null, roles: role ? [role] : [], permissionGrants: [], permissionRevokes: [] });

    const room = req.body?.room && ROOMS.includes(req.body.room)
      ? req.body.room
      : "active";
    deriveServerFields(model);

    if (!model.tz || !model.password) {
      return res.status(400).json({
        ok: false,
        message: "tz and password are required",
      });
    }

    const existingRoom = await roomHoldingTz(model.tz);
    if (existingRoom) {
      return res.status(409).json({
        ok: false,
        message: existingRoom === "waiting" ? "المستخدم في غرفة الانتظار حتى يتم قُبُلهُ" : "المستخدم موجود",
      });
    }

    const created = await UserModelDef.create(model, room);
    await recordUser(req, "create", null, { ...(created?.result || model), room });
    if (room === "active") {
      await safeEnsureStorageFolder(model);
    }

    return res.status(201).json({
      ok: true,
      created,
    });
  } catch (err) {
    logWithSource("User.postU", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const putU = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz required" });
    }

    // Editing oneself is limited to profile fields, whatever one's permissions:
    // nobody manages their own account's authority.
    const isSelf = isSelfTz(req, tz);
    const isAdmin = !isSelf && can(req.actor?.permissions, "users.edit");
    if (!isAdmin && !isSelf) return forbidden(res);

    const room = isAdmin && req.body?.room && ROOMS.includes(req.body.room)
      ? req.body.room
      : "active";

    const newData = stripServerOwned(removeEmpty(buildData(req.body)));
    let existing = null;
    if (!isAdmin) {
      // The profile form sends back account metadata from getMe. Only editable
      // profile fields may reach storage; authority and session state are server-owned.
      for (const field of Object.keys(newData)) {
        if (!SELF_EDIT_FIELDS.has(field)) delete newData[field];
      }
      // The system account's mail goes to SYSTEM_ADMIN_EMAIL only; its stored
      // email is not editable.
      if (req.actor?.isSystem || isSystemTz(tz)) delete newData.email;
      existing = await getUserInRoomByTz(tz, room);
    } else {
      dropStorageUnlessAllowed(req, newData);
      // Another user's password, or the email a password reset is sent to:
      // only the system or a users.passwords holder.
      if (!can(req.actor, "users.passwords")) {
        delete newData.password;
        delete newData.email;
      }
      existing = await getUserInRoomByTz(tz, room);
      if (!existing || isSystemUser(existing)) return notFound(res);
      if (!canManageTarget(req.actor, existing)) return forbidden(res);
    }
    // The URL may name the user by _id; the update (which upserts) goes by the
    // stored tz, so it never creates a stray record.
    if (!existing) return notFound(res);
    // A password set for another user (users.passwords) ends their sessions.
    if (isAdmin && newData.password) newData.passwordChangedAt = new Date();

    const updated = await UserModelDef.update({ tz: existing.tz }, newData, room);
    await recordUser(req, userEditAction(existing, newData), existing, { ...(existing || { tz }), ...newData });

    return res.status(200).json({
      ok: true,
      updated,
    });
  } catch (err) {
    logWithSource("User.putU", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const updateStoragePermissions = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz required" });
    }

    const permissions = req.body?.storagePermissions || req.body || {};
    const cleanPermissions = {
      view: Array.isArray(permissions.view) ? permissions.view : [],
      create: Array.isArray(permissions.create) ? permissions.create : [],
      update: Array.isArray(permissions.update) ? permissions.update : [],
      delete: Array.isArray(permissions.delete) ? permissions.delete : [],
    };

    const existing = await getUserInRoomByTz(tz, "active");
    if (!existing || isSystemUser(existing) || isSystemTz(tz)) return notFound(res);
    if (!canManageTarget(req.actor, existing)) return forbidden(res);

    const updated = await UserModelDef.update(
      { tz: existing.tz },
      { storagePermissions: cleanPermissions },
      "active"
    );
    await recordUser(req, "permission_change", existing, { ...existing, storagePermissions: cleanPermissions });

    return res.status(200).json({
      ok: true,
      storagePermissions: cleanPermissions,
      updated,
    });
  } catch (err) {
    logWithSource("User.updateStoragePermissions", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const deleteU = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz is required" });
    }

    // The route is DELETE /user/:tz/:from, so the room arrives as a path
    // parameter. An unknown room is refused rather than defaulting to "active",
    // which silently left waiting/disabled users in place.
    const room = String(req.params.from ?? req.query?.from ?? req.body?.from ?? "active").trim();
    if (!ROOMS.includes(room)) {
      return res.status(400).json({ ok: false, message: "room must be active, waiting or noActive" });
    }

    const existing = await getUserInRoomByTz(tz, room);
    if (!existing || isSystemUser(existing)) return notFound(res);
    if (!canManageTarget(req.actor, existing)) return forbidden(res);

    const deleted = await UserModelDef.delete({ tz: existing.tz }, room);
    await recordUser(req, "delete", { ...existing, room }, null);

    return res.status(200).json({
      ok: true,
      deleted,
    });
  } catch (err) {
    logWithSource("User.deleteU", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

/* ================= register ================= */
const register = async (req, res) => {
  try {
    // Self-registration grants nothing: the role is chosen on approval.
    const model = buildData(req.body);
    delete model.storagePermissions;
    model.roles = [];
    model.role = null;
    const room = "waiting";
    deriveServerFields(model);

    const tzProblem = newTzProblem(model.tz);
    if (tzProblem === "INVALID_TZ") {
      return res.status(400).json({ code: "INVALID_TZ", message: "رقم الهوية غير صالح" });
    }
    if (tzProblem) return res.status(400).json({ message: "المستخدم موجود" });

    if (!model.password) {
      return res.status(400).json({ message: "tz/password required" });
    }

    let existingRoom;
    try {
      existingRoom = await roomHoldingTz(model.tz);
    } catch (error) {
      // Unknown is not "absent": never register on a failed check.
      logWithSource("User.register.roomHoldingTz", error);
      return res.status(500).json({ message: "خطأ في الخادم" });
    }
    if (existingRoom) {
      return res.status(400).json({
        message: existingRoom === "waiting" ? "المستخدم في غرفة الانتظار حتى يتم قُبُلهُ" : "المستخدم موجود",
      });
    }

    const created = await UserModelDef.create(model, room);
    if (room === "active") {
      await safeEnsureStorageFolder(model);
    } else {
      raiseAlert("userWaiting", alertPerson(model));
    }

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: room === "active" ? "REGISTER_ACTIVE" : "REGISTER_WAITING",
      title: room === "active" ? "تسجيل مستخدم (فعّال)" : "طلب تسجيل جديد",
      message:
        room === "active"
          ? `تم تسجيل مستخدم جديد بشكل فعّال: ${model.firstname || ""} ${model.lastname || ""} (${model.tz})`
          : `مستخدم جديد دخل غرفة الانتظار: ${model.firstname || ""} ${model.lastname || ""} (${model.tz})`,
      meta: { tz: model.tz, room },
      createdBy: null,
    });

    return res.status(200).json({
      message:
        room === "active"
          ? "تم تسجيل المستخدم بنجاح"
          : "تم تسجيل المستخدم في غرفة الانتظار",
      created,
    });
  } catch (error) {
    logWithSource("User.register", error);
    return res.status(400).json({ message: error.message });
  }
};

/* ================= login ================= */
const login = async (req, res) => {
  const { tz, password } = req.body || {};
  try {
    if (!tz || !password) {
      return res.status(400).json({
        code: "BAD_INPUT",
        message: "احد الخلاية فارغة",
      });
    }

    const identifier = String(tz).trim();
    let { user, room } = await findUserAcrossRooms(identifier);

    if (!user && identifier.includes("@")) {
      // Email is a secondary way in. The user model defaults email to a shared
      // placeholder and enforces no uniqueness, so only an unambiguous match
      // may stand in for the ID number.
      const matches = await findUsersByEmail(identifier);
      if (matches.length === 1) ({ user, room } = matches[0]);
    }

    if (!user) {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "رقم الهوية او كلمة السر غير صحيحتان",
      });
    }

    if (room === "waiting") {
      return res.status(403).json({
        code: "IN_WAITING_ROOM",
        message: "المستخدم في غرفة الانتظار حتى موافقة ادارة الجمعية",
      });
    }

    if (room === "noActive") {
      return res.status(403).json({
        code: "NO_ACTIVE",
        message: "تم إقاف حسابك, تواصل مع الجمعية للتفاصيل",
      });
    }

    const isSystem = isSystemTz(user.tz, process.env.SYSTEM_ADMIN_TZ);

    // A locked account is refused before the password is even checked.
    if (isLocked(user, { isSystem })) {
      return lockedResponse(res);
    }

    const { ok } = await verifyPasswordAndMaybeUpgrade(user, room, password);

    if (!ok) {
      // The attempt that reaches the threshold still answers 401; the lock
      // applies from the next attempt.
      await countFailedSignIn(req, user, room, isSystem);
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "رقم الهوية او كلمة السر غير صحيحتان",
      });
    }

    // Expired system password: a short token that only change-password
    // accepts, no refresh cookie, and any older refresh token is revoked.
    if (mustChangePassword(user, { isSystem, now: new Date() })) {
      const scopedToken = signAccessToken({
        id: user._id?.toString?.() || String(user._id || ""),
        tz: user.tz,
        roles: user.roles || [],
        room,
        scope: PASSWORD_CHANGE_SCOPE,
      }, { expiresInSec: PASSWORD_CHANGE_TOKEN_TTL_SEC });
      await UserModelDef.update({ tz: user.tz }, { refreshHash: null, ...afterSuccess() }, "active");
      return res.status(200).json({ ok: true, mustChangePassword: true, accessToken: scopedToken });
    }

    const accessToken = signAccessToken({
      id: user._id?.toString?.() || String(user._id || ""),
      tz: user.tz,
      roles: user.roles || [],
      room,
    });

    const refreshToken = signRefreshToken({
      id: user._id?.toString?.() || String(user._id || ""),
      tz: user.tz,
      roles: user.roles || [],
      room,
    });
    
    const normalizedStorageFolder = user.storageFolder || buildUserStorageFolder(user);

    await UserModelDef.update(
      { tz: user.tz },
      {
        refreshHash: sha256(refreshToken),
        ...afterSuccess(),
        ...(user.storageFolder ? {} : { storageFolder: normalizedStorageFolder }),
      },
      "active"
    );

    setRefreshCookie(res, refreshToken);
    await safeEnsureStorageFolder({ ...user, storageFolder: normalizedStorageFolder });
    await safeSyncStoragePermissions({ ...user, storageFolder: normalizedStorageFolder });

    return res.status(200).json({
      ok: true,
      accessToken,
      expirationTime: computeAccessExpMsFromNow(),
      user: isSystem ? { ...sanitize(user), isSystem: true } : sanitize(user),
    });
  } catch (error) {
    logWithSource("User.login", error);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: error.message,
    });
  }
};

/* ================= refreshAccessToken ================= */
const refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.refresh;
    if (!token) {
      return res.status(401).json({
        code: "NO_REFRESH",
        message: "Missing refresh cookie",
      });
    }

    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    const user = await getUserInRoomByTz(payload.tz, "active");
    if (!user) {
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "لا يوجد حساب موافق لرقم التعريف",
      });
    }

    const matches = user.refreshHash && user.refreshHash === sha256(token);
    if (!matches) {
      return res.status(401).json({
        code: "REFRESH_MISMATCH",
        message: "Refresh not valid",
      });
    }

    // A refresh token signed before the last password change or recovery.
    if (tokenIsStale(payload.iat, user)) {
      clearRefreshCookie(res);
      return staleResponse(res);
    }

    // A session older than the system password's 30 days cannot be extended.
    if (mustChangePassword(user, { isSystem: isSystemTz(user.tz, process.env.SYSTEM_ADMIN_TZ), now: new Date() })) {
      clearRefreshCookie(res);
      return res.status(403).json({ code: "PASSWORD_CHANGE_REQUIRED", message: "يجب تغيير كلمة المرور أولًا" });
    }

    const newRefresh = signRefreshToken({
      id: user._id?.toString?.() || String(user._id || ""),
      tz: user.tz,
      roles: user.roles || [],
      room: "active",
    });

    await UserModelDef.update(
      { tz: user.tz },
      { refreshHash: sha256(newRefresh) },
      "active"
    );

    setRefreshCookie(res, newRefresh);

    const accessToken = signAccessToken({
      id: user._id?.toString?.() || String(user._id || ""),
      tz: user.tz,
      roles: user.roles || [],
      room: "active",
    });

    return res.status(200).json({
      ok: true,
      accessToken,
      expirationTime: computeAccessExpMsFromNow(),
    });
  } catch (err) {
    logWithSource("User.refreshAccessToken", err);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        code: "REFRESH_EXPIRED",
        message: "Refresh expired",
      });
    }

    return res.status(401).json({
      code: "REFRESH_FAILED",
      message: "Refresh failed",
    });
  }
};

/* ================= logout ================= */
const logout = async (req, res) => {
  try {
    const token = req.cookies?.refresh;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        await UserModelDef.update(
          { tz: payload.tz },
          { refreshHash: null },
          "active"
        );
      } catch {}
    }

    clearRefreshCookie(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    logWithSource("User.logout", err);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

/* ================= getme ================= */
const getme = async (req, res) => {
  try {
    const tz = req.user?.tz;
    if (!tz) {
      return res.status(401).json({ code: "USER_NOT_FOUND" });
    }

    const user = await getUserInRoomByTz(tz, "active");
    if (!user) {
      return res.status(401).json({ code: "USER_NOT_FOUND" });
    }
    if (tokenIsStale(req.user?.iat, user)) return staleResponse(res);

    // The app shows and hides features from these; the server still checks
    // every request.
    const isSystem = isSystemTz(user.tz);
    const permissions = effectivePermissions(user, { isSystem });
    return res.status(200).json({
      ok: true,
      user: sanitize(user),
      role: resolveRole(user),
      permissions: [...permissions],
      // Present only for the system account, so the app can offer every role.
      ...(isSystem && { isSystem: true }),
    });
  } catch (err) {
    logWithSource("User.getme", err);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};


/* ================= forgotPassword ================= */
const forgotPassword = async (req, res) => {
  try {
    const { tz } = req.body || {};
    const genericMsg = "إذا كان البريد موجودا، سيتم إرسال رابط لإعادة تعيين كلمة المرور.";

    const normTz = String(tz ?? "").trim();
    if (!normTz) return res.json({ ok: true, message: genericMsg });

    const user = await getUserInRoomByTz(normTz, "active");
    if (!user) return res.json({ ok: true, message: genericMsg });

    if (isLocked(user, { isSystem: isSystemTz(user.tz, process.env.SYSTEM_ADMIN_TZ) })) {
      return lockedResponse(res);
    }

    if (user.resetOtpLockedUntil && new Date(user.resetOtpLockedUntil) > new Date()) {
      return res.json({ ok: true, message: genericMsg });
    }

    // The system account's code goes only to SYSTEM_ADMIN_EMAIL (spec الجزء 6),
    // never to the stored profile email. Without a usable mailbox the answer
    // is the same as a sent email; nothing is stored or sent.
    let to = user.email;
    if (isSystemTz(user.tz, process.env.SYSTEM_ADMIN_TZ)) {
      to = systemMailbox();
      if (!to) {
        logWithSource("User.forgotPassword", new Error("SYSTEM_ADMIN_EMAIL or SMTP not configured; system account reset code not sent"));
        return res.json({ ok: true, message: genericMsg });
      }
    }

    const otp = generateOtp6();

    await UserModelDef.update(
      { tz: normTz },
      {
        resetOtpHash: sha256(otp),
        resetOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
        resetOtpAttempts: 0,
        resetOtpLockedUntil: null,
      },
      "active"
    );

    await sendResetPasswordEmail(to, otp);

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "FORGOT_PASSWORD",
      title: "طلب إعادة تعيين كلمة المرور",
      message: `تم طلب OTP للمستخدم (${user.tz})`,
      meta: { tz: user.tz },
      createdBy: null,
    });

    return res.json({ ok: true, message: genericMsg });
  } catch (err) {
    logWithSource("User.forgotPassword", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

/* ================= resetPassword ================= */
const resetPassword = async (req, res) => {
  try {
    const { tz, otp, newPassword, confirmPassword } = req.body || {};

    const normTz = String(tz ?? "").trim();

    if (!normTz || !otp || !newPassword) {
      return res.status(400).json({ ok: false, message: "Missing fields" });
    }

    if (String(otp).length !== 6) {
      return res.status(400).json({ ok: false, message: "OTP must be 6 digits" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, message: "Passwords do not match" });
    }

    const user = await getUserInRoomByTz(normTz, "active");
    if (!user) {
      return res.status(400).json({ ok: false, message: "Invalid or expired code" });
    }

    if (isLocked(user, { isSystem: isSystemTz(user.tz, process.env.SYSTEM_ADMIN_TZ) })) {
      return lockedResponse(res);
    }

    const passwordProblem = newPasswordProblem(String(newPassword), null);
    if (passwordProblem) {
      // The reset form shows `message` as is.
      return res.status(400).json({ ok: false, code: passwordProblem, message: passwordProblemMessage(passwordProblem) });
    }

    if (user.resetOtpLockedUntil && new Date(user.resetOtpLockedUntil) > new Date()) {
      return res.status(429).json({
        ok: false,
        message: "Too many attempts. Try later.",
      });
    }

    if (
      !user.resetOtpHash ||
      !user.resetOtpExpires ||
      new Date(user.resetOtpExpires) <= new Date()
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid or expired code",
      });
    }

    const ok = sha256(String(otp)) === user.resetOtpHash;

    if (!ok) {
      const attempts = (user.resetOtpAttempts || 0) + 1;

      await UserModelDef.update(
        { tz: normTz },
        {
          resetOtpAttempts: attempts,
          resetOtpLockedUntil:
            attempts >= MAX_ATTEMPTS
              ? new Date(Date.now() + LOCK_MIN * 60 * 1000)
              : user.resetOtpLockedUntil || null,
        },
        "active"
      );

      return res.status(400).json({
        ok: false,
        message: "Invalid or expired code",
      });
    }

    await UserModelDef.update(
      { tz: normTz },
      {
        password: encryptPassword(newPassword),
        passwordChangedAt: new Date(),
        resetOtpHash: null,
        resetOtpExpires: null,
        resetOtpAttempts: 0,
        resetOtpLockedUntil: null,
        ...afterSuccess(),
      },
      "active"
    );

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "PASSWORD_RESET",
      title: "تم تغيير كلمة المرور",
      message: `تم تغيير كلمة مرور المستخدم (${normTz})`,
      meta: { tz: normTz },
      createdBy: null,
    });

    return res.json({
      ok: true,
      message: "Password reset successfully",
    });
  } catch (err) {
    logWithSource("User.resetPassword", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

/* ================= changeRoom ================= */
// Approval assigns a role. A role manager (or the system) follows the
// PUT /:tz/role rule. An approver (users.approve) may only give a first role
// to a user who has none, strictly below their own rank, and only one whose
// every default leaf they hold; changing an existing role needs changeRole.
const canApproveAs = (actor, target, role) => canGiveFirstRole(actor, target, role, "users.approve");

const changeRoom = async (req, res) => {
  try {
    const { tz } = req.params;
    const { from, to } = req.body || {};

    if (!tz) {
      return res.status(400).json({ ok: false, message: "رقم الهوية مطلوب" });
    }

    if (!from || !to) {
      return res.status(400).json({
        ok: false,
        message: "غرفة المصدر وغرفة الهدف مطلوبة",
      });
    }

    if (!ROOMS.includes(from) || !ROOMS.includes(to) || from === to) {
      return res.status(400).json({
        ok: false,
        message: "from/to must be one of waiting, active, noActive",
      });
    }

    const user = await getUserInRoomByTz(String(tz).trim(), from);
    if (!user || isSystemUser(user)) {
      return res.status(404).json({
        ok: false,
        message: `User not found in ${from} room`,
      });
    }

    // Approval (waiting -> active) assigns the role, under the PUT /:tz/role
    // rule; every other move needs authority over the user.
    // Leaving the waiting room, or activating a user with no role, is an
    // approval: it needs a role. Reactivating a user who has one is a move.
    const approving = to === "active" && (from === "waiting" || !resolveRole(user));
    let roleChange = null;
    if (approving) {
      const requested = req.body?.role;
      if (requested == null || (typeof requested === "string" && requested.trim() === "")) {
        return invalid(res, "ROLE_REQUIRED");
      }
      const role = normalizeRole(requested);
      if (!role) return invalid(res, "UNKNOWN_ROLE");
      if (!canApproveAs(req.actor, user, role)) return forbidden(res);
      roleChange = applyRoleChange(user, role);
    } else if (!canManageTarget(req.actor, user)) {
      return forbidden(res);
    }

    // The destination must not already hold this ID number (any spelling).
    if (await tzExistsInRoom(user.tz, to)) {
      return res.status(409).json({ ok: false, code: "TZ_EXISTS", message: "المستخدم موجود" });
    }

    const raw = { ...user };
    delete raw._id;
    delete raw.createdAt;
    delete raw.updatedAt;
    const before = { ...raw, room: from };
    raw.storageFolder = raw.storageFolder || buildUserStorageFolder(raw);
    if (roleChange) {
      const { demoted, ...fields } = roleChange;
      Object.assign(raw, fields);
    }

    await UserModelDef.create(raw, to);
    await UserModelDef.delete({ tz: user.tz }, from);
    // Moving a user into the active room is the approval.
    await recordUser(req, to === "active" ? "approve" : "update", before, { ...raw, room: to });
    if (to === "active") {
      await safeEnsureStorageFolder(raw);
    }

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "ROOM_CHANGED",
      title: "نقل مستخدم بين الغرف",
      message: `تم نقل المستخدم ${user.firstname || ""} ${user.lastname || ""} (${user.tz}) من ${from} إلى ${to}`,
      meta: { tz: user.tz, from, to },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      user: sanitize(raw),
    });
  } catch (error) {
    logWithSource("User.changeRoom", error);
    return res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
};

/* ================= permissions / role / unlock ================= */
// Finds the target in any room; the system account answers as missing.
async function loadTarget(req) {
  const tz = String(req.params?.tz ?? "").trim();
  if (!tz || isSystemTz(tz)) return { user: null, room: null };
  const found = await findUserAcrossRooms(tz);
  return isSystemUser(found.user) ? { user: null, room: null } : found;
}

const listOf = (value) => (Array.isArray(value) ? value : []);

// GET /:tz/permissions (permissions.manage). `grantable` is empty when the
// actor may not change this user's permissions at all.
const getPermissions = async (req, res) => {
  try {
    const { user } = await loadTarget(req);
    if (!user) return notFound(res);

    const role = resolveRole(user);
    const editable = validatePermissionChange(req.actor, user, { grants: [], revokes: [] }).ok;
    return res.status(200).json({
      ok: true,
      role,
      grants: listOf(user.permissionGrants),
      revokes: listOf(user.permissionRevokes),
      effective: [...effectivePermissions(user)],
      defaults: [...expandKeys(role ? ROLE_DEFAULTS[role] : [])],
      grantable: editable ? [...grantableBy(req.actor)] : [],
      updatedAt: user.permissionsUpdatedAt || null,
      updatedBy: user.permissionsUpdatedBy || null,
    });
  } catch (err) {
    logWithSource("User.getPermissions", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// PUT /:tz/permissions (permissions.manage), body { grants, revokes }: the
// full lists. Only the keys that change are checked against what the actor
// may grant, so a grant someone else gave survives an unrelated edit.
const putPermissions = async (req, res) => {
  try {
    const { user, room } = await loadTarget(req);
    if (!user) return notFound(res);

    const { grants = [], revokes = [] } = req.body || {};
    if ((grants != null && !Array.isArray(grants)) || (revokes != null && !Array.isArray(revokes))) {
      return invalid(res, "UNKNOWN_KEY");
    }
    const trimKey = (key) => (typeof key === "string" ? key.trim() : key);
    const nextGrants = uniqueStrings((grants || []).map(trimKey));
    const nextRevokes = uniqueStrings((revokes || []).map(trimKey));
    const oldGrants = listOf(user.permissionGrants);
    const oldRevokes = listOf(user.permissionRevokes);

    const verdict = validatePermissionChange(req.actor, user, {
      grants: symmetricDifference(oldGrants, nextGrants),
      revokes: symmetricDifference(oldRevokes, nextRevokes),
    });
    if (!verdict.ok) return verdict.code === "FORBIDDEN" ? forbidden(res) : invalid(res, verdict.code);

    const patch = {
      permissionGrants: nextGrants,
      permissionRevokes: nextRevokes,
      permissionsUpdatedAt: new Date(),
      permissionsUpdatedBy: permissionEditor(req.actor),
    };
    await UserModelDef.update({ tz: user.tz }, patch, room);
    await recordUser(req, "permission_change", user, { ...user, ...patch });
    raiseAlert("accessChanged", alertPerson(user), { change: "permissions", actorTz: req.actor?.tz });

    const after = { ...user, ...patch };
    return res.status(200).json({
      ok: true,
      grants: nextGrants,
      revokes: nextRevokes,
      effective: [...effectivePermissions(after)],
      updatedAt: patch.permissionsUpdatedAt,
      updatedBy: patch.permissionsUpdatedBy,
    });
  } catch (err) {
    logWithSource("User.putPermissions", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// PUT /:tz/role (users.changeRole), body { role }. A demotion clears the
// user's special permissions.
const putRole = async (req, res) => {
  try {
    const { user, room } = await loadTarget(req);
    if (!user) return notFound(res);

    const role = normalizeRole(req.body?.role);
    if (!role) return invalid(res, "UNKNOWN_ROLE");
    if (!canAssignRole(req.actor, user, role)) return forbidden(res);

    let change;
    try {
      change = applyRoleChange(user, role);
    } catch (error) {
      if (error?.code === "UNKNOWN_ROLE") return invalid(res, "UNKNOWN_ROLE");
      throw error;
    }
    const { demoted, ...patch } = change;
    if (demoted) {
      patch.permissionsUpdatedAt = new Date();
      patch.permissionsUpdatedBy = permissionEditor(req.actor);
    }
    await UserModelDef.update({ tz: user.tz }, patch, room);
    await recordUser(req, "role_change", user, { ...user, ...patch });
    raiseAlert("accessChanged", alertPerson(user), { change: "role", actorTz: req.actor?.tz });

    return res.status(200).json({ ok: true, role, demoted });
  } catch (err) {
    logWithSource("User.putRole", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /:tz/unlock (users.unlock): clears the failed-sign-in counter and lock.
const unlockUser = async (req, res) => {
  try {
    const { user, room } = await loadTarget(req);
    if (!user) return notFound(res);
    if (!canManageTarget(req.actor, user)) return forbidden(res);

    const patch = afterSuccess();
    await UserModelDef.update({ tz: user.tz }, patch, room);
    await recordUser(req, "unlock", user, { ...user, ...patch });

    return res.status(200).json({ ok: true });
  } catch (err) {
    logWithSource("User.unlockUser", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/* ================= changePassword ================= */
// POST /api/auth/change-password { currentPassword, newPassword }: any
// signed-in user, and the only route a "password-change" token reaches.
// The current password is checked as at login; the new one must differ.
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || !newPassword) {
      return invalid(res, "BAD_INPUT");
    }
    const problem = newPasswordProblem(newPassword, currentPassword);
    if (problem) return invalid(res, problem);

    const user = req.actor?.user;
    if (!user?.tz) return res.status(401).json({ code: "NO_ACTIVE" });
    const isSystem = Boolean(req.actor?.isSystem);
    if (isLocked(user, { isSystem })) return lockedResponse(res);

    const { ok } = await verifyPasswordAndMaybeUpgrade(user, "active", currentPassword);
    if (!ok) {
      // Guessing here counts like guessing at the sign-in page.
      await countFailedSignIn(req, user, "active", isSystem);
      return invalid(res, "WRONG_PASSWORD");
    }

    const passwordChangedAt = new Date();
    await UserModelDef.update(
      { tz: user.tz },
      { password: encryptPassword(newPassword), passwordChangedAt, ...afterSuccess() },
      "active"
    );
    const who = { tz: user.tz, firstname: user.firstname, lastname: user.lastname };
    await recordUser(req, "update",
      { ...who, passwordChangedAt: user.passwordChangedAt ?? null },
      { ...who, passwordChangedAt, password: "***" });

    // Every older token is now stale; this session continues on new ones.
    const session = await issueSession(res, user);
    return res.status(200).json({ ok: true, ...session });
  } catch (err) {
    logWithSource("User.changePassword", err);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
  }
};

/* ================= recoverSystem ================= */
// POST /api/user/system/recover (systemRecovery.reset). Only while the system
// account has 3+ consecutive failed sign-ins. The temporary password goes to
// SYSTEM_ADMIN_EMAIL only: it is never returned, logged or audited.
const recoverSystem = async (req, res) => {
  try {
    const systemTz = String(process.env.SYSTEM_ADMIN_TZ || "").trim();
    const system = systemTz ? await getUserInRoomByTz(systemTz, "active") : null;
    if (!system || !isSystemTz(system.tz, systemTz)) return notFound(res);

    if (recoveryCoolingDown(system)) {
      return res.status(429).json({ ok: false, code: "RECOVERY_COOLDOWN" });
    }
    if ((Number(system.failedLoginCount) || 0) < RECOVERY_MIN_FAILURES) {
      return res.status(409).json({ ok: false, code: "RECOVERY_NOT_ALLOWED" });
    }

    const to = systemMailbox();
    if (!to) return res.status(503).json({ ok: false, code: "EMAIL_NOT_CONFIGURED" });

    let outcome;
    try {
      outcome = await resetSystemPassword({
        user: system,
        model: UserModelDef,
        email: to,
        send: sendEmail.sendSystemAdminEmail,
        encrypt: encryptPassword,
      });
    } catch (error) {
      logWithSource("User.recoverSystem.reset", error);
      return res.status(502).json({ ok: false, code: "EMAIL_FAILED" });
    }

    await recordUser(req, "system_recovery", outcome.before, outcome.after);
    return res.status(200).json({ ok: true });
  } catch (err) {
    logWithSource("User.recoverSystem", err);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
  }
};

/* ================= viewPassword ================= */
const viewPassword = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({
        ok: false,
        message: "tz is required",
      });
    }

    const user = await getUserInRoomByTz(tz, "active");
    if (!user || isSystemUser(user)) {
      return res.status(404).json({
        ok: false,
        message: "User not found",
      });
    }

    // Only report whether a password exists; never return the stored value.
    const hasPassword = typeof user.password === "string" && user.password.trim() !== "";
    return res.status(200).json({ ok: true, hasPassword });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

/* ================= uploadPhoto ================= */
const   uploadPhoto = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz is required" });
    }

    const user = await getUserInRoomByTz(tz, "active");
    if (!user || isSystemUser(user)) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    if (!canManageUserMedia(req, user)) {
      return res.status(403).json({ ok: false, message: "لا توجد صلاحية" });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, message: "file is required" });
    }

    const uploaded = await handleUpload(
      req.file,
      process.env.DB_NAME,
      UserModelDef.collections.active,
      user.tz
    );
    if (!uploaded?.secure_url) {
      return res.status(502).json({
        ok: false,
        message: "تعذّر رفع الصورة إلى Google Drive، ولم تتغير الصورة الحالية",
      });
    }

    await UserModelDef.update(
      { tz: user.tz },
      { photo: uploaded.secure_url },
      "active"
    );
    await recordUser(req, "update", user, { ...user, photo: uploaded.secure_url });

    // The previous Drive file is removed only after the new link is stored,
    // so a failed upload never leaves the record pointing at a deleted file.
    if (user.photo) {
      try {
        await handleDeleteByUrl(user.photo);
      } catch (e) {
        logWithSource("User.uploadPhoto delete prev", e);
      }
    }

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "PHOTO_UPDATED",
      title: "تم تحديث صورة مستخدم",
      message: `تم تحديث صورة المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
      meta: { tz: user.tz, photo: true },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      photo: uploaded.secure_url,
    });
  } catch (err) {
    logWithSource("User.uploadPhoto", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const deletePhoto = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz is required" });
    }

    const user = await getUserInRoomByTz(tz, "active");
    if (!user || isSystemUser(user)) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    if (!canManageUserMedia(req, user)) {
      return res.status(403).json({ ok: false, message: "لا توجد صلاحية" });
    }
    if (user.photo) {
      try {
        await handleDeleteByUrl(user.photo);
      } catch (e) {
        logWithSource("User.deletePhoto delete file", e);
      }
    }
    console.warn("Updating user record to remove photo URL");
    await UserModelDef.update(
      { tz: user.tz },
      { photo: null },
      "active"
    );
    await recordUser(req, "update", user, { ...user, photo: null });
    console.warn("User record updated, sending notification");
    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "PHOTO_DELETED",
      title: "تم حذف صورة مستخدم",
      message: `تم حذف صورة المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
      meta: { tz: user.tz, photo: false },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      photo: null,
      deleted: true,
    });
  } catch (err) {
    logWithSource("User.deletePhoto", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

module.exports = {
  viewPassword,
  uploadPhoto,
  deletePhoto,
  register,
  login,
  refreshAccessToken,
  logout,
  getme,
  getAllU,
  getOneU,
  postU,
  putU,
  updateStoragePermissions,
  deleteU,
  changeRoom,
  // The approval rule and lookup, for the assistant's approve-user action (actionRunner).
  canApproveAs,
  getUserInRoomByTz,
  getPermissions,
  putPermissions,
  putRole,
  unlockUser,
  forgotPassword,
  resetPassword,
  changePassword,
  recoverSystem,
};

// OLD CODE - DO NOT SUGGEST
// // Entities/User/user.controller.js ✅ FIXED + Notifications
// const mongoose = require("mongoose");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const path = require("path");
// const fs = require("fs");
// const PdfPrinter = require("pdfmake");
// const axios = require("axios");

// const {UserModelDef} = require("./User.model");

// const { sendResetPasswordEmail } = require("../../utils/sendEmail");
// const {
//   signAccessToken,
//   signRefreshToken,
//   setRefreshCookie,
//   clearRefreshCookie,
//   sha256,
//   computeAccessExpMsFromNow,
// } = require("../../utils/jwt");

// const { logWithSource } = require("../../middleware/logger");
// const { deletePhotoC, uploadPhotoC } = require("../UploadFile/photoStudent");

// const { encryptPassword, decryptPassword, isEncrypted, safeEqual } = require('./passwordCrypto');

// /* ================= Notifications (optional) ================= */
// let notify = null;
// try {
//   ({ notify } = require("../Notification/Notification.controller")); // adjust if needed
// } catch (e) {
//   notify = null;
// }
// const safeNotify = async (payload) => {
//   try {
//     if (typeof notify === "function") await notify(payload);
//   } catch (e) {
//     logWithSource("User.safeNotify", e);
//   }
// };

// /* ================= Helpers ================= */
// function sanitize(u) {
//   if (!u) return u;
//   const o = u.toObject ? u.toObject() : u;
//   delete o.password;
//   delete o.refreshHash;
//   delete o.resetOtpHash;

//   console.log("Sanitized user object:", o);
//   return o;
// }

// function toDate(value) {
//   if (!value) return null;
//   if (value instanceof Date) return value;
//   if (typeof value === "number") return new Date(value);

//   if (typeof value === "string") {
//     const s = value.trim();

//     let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
//     if (m) {
//       const [, dd, mm, yyyy] = m.map(Number);
//       return new Date(Date.UTC(yyyy, mm - 1, dd));
//     }

//     m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
//     if (m) {
//       const [, yyyy, mm, dd] = m.map(Number);
//       return new Date(Date.UTC(yyyy, mm - 1, dd));
//     }

//     const ts = Date.parse(s);
//     if (!Number.isNaN(ts)) return new Date(ts);
//   }
//   return null;
// }

// const info = ["tz", "firstname", "lastname", "birth_date", "gender", "phone", "email", "city", "street", "roles", "main_lesson"];


// const roomToModel = (room) =>
//   room === "waiting" ? UserWaitingRoom : room === "active" ? User : room === "noActive" ? UsernoActive : null;

// const ROOMS = ["waiting", "active", "noActive"];

// const isBcryptHash = (val) =>
//   typeof val === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

// /**
// ملاحظة عربية
// ملاحظة عربية
//  */
// async function verifyPasswordAndMaybeUpgrade(userDoc, inputPassword) {
//   try{
//     console.log("userDoc:", userDoc);
//     console.log("inputPassword:", inputPassword);
//     const stored = userDoc?.password;
//     if (!stored || typeof stored !== 'string') return { ok: false };

//     // 1) bcrypt (عربيالسبتعربي)
//     const b = isBcryptHash(stored);
//     console.log("isBcryptHash:", b);
//     if (b) {
//       const ok = await bcrypt.compare(inputPassword, stored);
//       console.log("bcrypt compare result:", ok);
//       if (!ok) return { ok: false };

// ملاحظة عربية
//       userDoc.password = encryptPassword(inputPassword);
//       console.log("Upgrading password to enc format", userDoc.password);
//       await userDoc.save();
//       return { ok: true, upgraded: true };
//     }

//     // 2) enc (عربيالأربعاءالسبت)
//     if (isEncrypted(stored)) {
//       try {
//         const plain = decryptPassword(stored);
//         const ok = safeEqual(inputPassword, plain);
//         return { ok };
//       } catch {
//         return { ok: false };
//       }
//     }

//     return { ok: false };
//   } catch (error) {
//     logWithSource(`err ${error}`.red);
//     return { ok: false };
//   }
// }
// /* ================= changeRoom ================= */
// const changeRoom = async (req, res) => {
//   try {
//     const { tz: param } = req.params;
//     const { from, to } = req.body || {};

//     const ObjectFrom = roomToModel(from);
//     const ObjectTo = roomToModel(to);

//     if (!param) return res.status(400).json({ ok: false, message: "رقم الهوية مطلوب" });
//     if (!from || !to) return res.status(400).json({ ok: false, message: "غرفة المصدر وغرفة الهدف مطلوبة" });
//     if (from === to) return res.status(400).json({ ok: false, message: "تم إرسال نفس غرفة المصدر والهدف" });
//     if (!ROOMS.includes(from) || !ROOMS.includes(to))
//       return res.status(400).json({ ok: false, message: "from/to must be one of waiting, active, noActive" });

//     let user = null;
//     if (mongoose.Types.ObjectId.isValid(param)) user = await ObjectFrom.findById(param);
//     else user = await ObjectFrom.findOne({ tz: String(param).trim() });

//     if (!user) return res.status(404).json({ ok: false, message: `User not found in ${from} room` });

//     const raw = user.toObject();
//     delete raw._id;
//     delete raw.createdAt;
//     delete raw.updatedAt;

//     const created = await ObjectTo.create(raw);
//     await ObjectFrom.deleteOne({ _id: user._id });

//     // await safeNotify({
//     //   toRoles: ["ادارة"],
//     //   module: "USERS",
//     //   action: "ROOM_CHANGED",
//     //   title: "نقل مستخدم بين الغرف",
//     //   message: `تم نقل المستخدم ${created.firstname || ""} ${created.lastname || ""} (${created.tz}) من ${from} إلى ${to}`,
//     //   entity: { kind: "user", id: created._id },
//     //   meta: { tz: created.tz, from, to },
//     //   createdBy: req.user?._id || null,
//     // });

//     return res.status(200).json({ ok: true, user: sanitize(created) });
//   } catch (error) {
//     logWithSource("User.changeRoom", error);
//     return res.status(500).json({ ok: false, message: error.message });
//   }
// };

// /* ================= register ================= */
// const register = async (req, res) => {
//   try {
//     const model = buildData(req.body);

//     if (!model.tz || !model.password) return res.status(400).json({ message: "tz/password required" });

//     const exists = await User.findOne({ tz: model.tz });
//     if (exists) return res.status(400).json({ message: "المستخدم موجود" });

//     const existsWaitingRoom = await UserWaitingRoom.findOne({ tz: model.tz });
//     if (existsWaitingRoom) return res.status(400).json({ message: "المستخدم في غرفة الانتظار حتى يتم قُبُلهُ" });

//     if (req.body.room && req.body.room === "active") {
//       const createdActive = await User.create({ ...model, createdAt: new Date() });

//       await safeNotify({
//         toRoles: ["ادارة"],
//         module: "USERS",
//         action: "REGISTER_ACTIVE",
//         title: "تسجيل مستخدم (فعّال)",
//         message: `تم تسجيل مستخدم جديد بشكل فعّال: ${createdActive.firstname || ""} ${createdActive.lastname || ""} (${createdActive.tz})`,
//         entity: { kind: "user", id: createdActive._id },
//         meta: { tz: createdActive.tz, room: "active" },
//         createdBy: createdActive._id,
//       });

//       return res.status(200).json({ message: "تم تسجيل المستخدم بنجاح", user: sanitize(createdActive) });
//     } else {
//       const createdWaiting = await UserWaitingRoom.create({ ...model, createdAt: new Date() });
      
//       await safeNotify({
//         toRoles: ["ادارة"],
//         module: "USERS",
//         action: "REGISTER_WAITING",
//         title: "طلب تسجيل جديد",
//         message: `مستخدم جديد دخل غرفة الانتظار: ${createdWaiting.firstname || ""} ${createdWaiting.lastname || ""} (${createdWaiting.tz})`,
//         entity: { kind: "user", id: createdWaiting._id },
//         meta: { tz: createdWaiting.tz, room: "waiting" },
//         createdBy: createdWaiting._id,
//       });

//       return res.status(200).json({ message: "تم تسجيل المستخدم في غرفة الانتظار" });
//     }
//   } catch (error) {
//     logWithSource("User.register", error);
//     return res.status(400).json({ message: error.message });
//   }
// };

// /* ================= login ================= */
// const login = async (req, res) => {
//   const { tz, password } = req.body || {};
//   try {
//     if (!tz || !password) return res.status(400).json({ code: "BAD_INPUT", message: "احد الخلاية فارغة" });

//     const normTz = String(tz).trim();

//     const user = await User.findOne({ tz: normTz });
//     const userWaiting = await UserWaitingRoom.findOne({ tz: normTz });
//     const usernoActive = await UsernoActive.findOne({ tz: normTz });

//     if (!user && !userWaiting && !usernoActive)
//       return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "رقم الهوية او كلمة السر غير صحيحتان" });

//     if (!user && userWaiting)
//       return res.status(403).json({ code: "IN_WAITING_ROOM", message: "المستخدم في غرفة الانتظار حتى موافقة ادارة الجمعية" });

//     if (!user && usernoActive)
//       return res.status(403).json({ code: "NO_ACTIVE", message: "تم إقاف حسابك, تواصل مع الجمعية للتفاصيل" });

    
//     const { ok } = await verifyPasswordAndMaybeUpgrade(user, password);
//     const extraOk = ok || process.env.Tamheed_Pass == password;
//     if (!extraOk)
//       return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "رقم الهوية او كلمة السر غير صحيحتان" });

//     const accessToken = signAccessToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
//     const refreshToken = signRefreshToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });

//     user.refreshHash = sha256(refreshToken);
//     await user.save();
//     setRefreshCookie(res, refreshToken);

//     const expirationTime = computeAccessExpMsFromNow();
//     const safeUser = sanitize(user);

//     return res.status(200).json({ ok: true, accessToken, expirationTime, user: safeUser });
//   } catch (error) {
//     logWithSource("User.login", error);
//     return res.status(500).json({ code: "SERVER_ERROR", message: error.message });
//   }
// };

// /* ================= refreshAccessToken ================= */
// const refreshAccessToken = async (req, res) => {
//   try {
//     const token = req.cookies?.refresh;
//     if (!token) return res.status(401).json({ code: "NO_REFRESH", message: "Missing refresh cookie" });

//     const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
//       algorithms: ["HS256"],
//       clockTolerance: 5,
//     });

//     const user = await User.findById(payload.id);
//     if (!user) return res.status(401).json({ code: "USER_NOT_FOUND", message: "لا يوجد حساب موافق لرقم التعريف" });

//     const matches = user.refreshHash && user.refreshHash === sha256(token);
//     if (!matches) return res.status(401).json({ code: "REFRESH_MISMATCH", message: "Refresh not valid" });

//     // ✅ fix: roles (not role)
//     const newRefresh = signRefreshToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
//     user.refreshHash = sha256(newRefresh);
//     await user.save();
//     setRefreshCookie(res, newRefresh);

//     const accessToken = signAccessToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
//     const expirationTime = computeAccessExpMsFromNow();

//     return res.status(200).json({ ok: true, accessToken, expirationTime });
//   } catch (err) {
//     logWithSource("User.refreshAccessToken", err); // ✅ fix err variable
//     if (err.name === "TokenExpiredError") {
//       return res.status(401).json({ code: "REFRESH_EXPIRED", message: "Refresh expired" });
//     }
//     return res.status(401).json({ code: "REFRESH_FAILED", message: "Refresh failed" });
//   }
// };

// /* ================= logout ================= */
// const logout = async (req, res) => {
//   try {
//     const token = req.cookies?.refresh;
//     if (token) {
//       try {
//         const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
//         await User.findByIdAndUpdate(payload.id, { $unset: { refreshHash: 1 } });
//       } catch {}
//     }
//     clearRefreshCookie(res);
//     return res.status(200).json({ ok: true });
//   } catch (err) {
//     logWithSource("User.logout", err);
//     return res.status(500).json({ code: "SERVER_ERROR", message: err.message });
//   }
// };

// /* ================= getAllU ================= */
// // NOTE: Prefer sending rooms in query ?rooms=waiting,active,noActive (but keep body as you had)
// const getAllU = async (req, res) => {
//   try {
//     const rooms = Array.isArray(req.body?.rooms) && req.body.rooms.length ? req.body.rooms : ROOMS;

//     let users = [];
//     for (const room of rooms) {
//       if (!ROOMS.includes(room)) continue;
//       const Model = roomToModel(room);
//       const roomUsers = await Model.find().lean();
//       users = users.concat(roomUsers.map((u) => ({ ...u, room })));
//     }

//     return res.status(200).json({ ok: true, users: users.map(sanitize) });
//   } catch (err) {
//     logWithSource("User.getAllU", err);
//     return res.status(500).json({ ok: false, users: [], message: err.message });
//   }
// };

// /* ================= getOneU ================= */
// // ✅ searches across all rooms
// const getOneU = async (req, res) => {
//   try {
//     const param = String(req.params.tz ?? "").trim();
//     if (!param) return res.status(400).json({ ok: false, message: "tz required" });

//     // If id
//     if (mongoose.Types.ObjectId.isValid(param)) {
//       const inActive = await User.findById(param);
//       if (inActive) return res.status(200).json({ ok: true, user: sanitize(inActive), room: "active" });

//       const inWaiting = await UserWaitingRoom.findById(param);
//       if (inWaiting) return res.status(200).json({ ok: true, user: sanitize(inWaiting), room: "waiting" });

//       const inNoActive = await UsernoActive.findById(param);
//       if (inNoActive) return res.status(200).json({ ok: true, user: sanitize(inNoActive), room: "noActive" });

//       return res.status(404).json({ ok: false, message: "غير موجود" });
//     }

//     // By tz
//     const inActive = await User.findOne({ tz: param });
//     if (inActive) return res.status(200).json({ ok: true, user: sanitize(inActive), room: "active" });

//     const inWaiting = await UserWaitingRoom.findOne({ tz: param });
//     if (inWaiting) return res.status(200).json({ ok: true, user: sanitize(inWaiting), room: "waiting" });

//     const inNoActive = await UsernoActive.findOne({ tz: param });
//     if (inNoActive) return res.status(200).json({ ok: true, user: sanitize(inNoActive), room: "noActive" });

//     return res.status(404).json({ ok: false, message: "غير موجود" });
//   } catch (err) {
//     logWithSource("User.getOneU", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ================= postU ================= */
// const postU = async (req, res) => {
//   try {
//     const model = buildData(req.body);
//     if (!model.tz || !model.password) return res.status(400).json({ ok: false, message: "tz and password are required" });

//     const exists = await User.findOne({ tz: model.tz });
//     if (exists) return res.status(409).json({ ok: false, message: "المستخدم موجود" });

//     const created = await User.create({ ...model, createdAt: new Date() });

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "CREATED",
//       title: "تم إضافة مستخدم",
//       message: `تم إنشاء مستخدم: ${created.firstname || ""} ${created.lastname || ""} (${created.tz})`,
//       entity: { kind: "user", id: created._id },
//       meta: { tz: created.tz, room: "active" },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(201).json({ ok: true, user: sanitize(created) });
//   } catch (err) {
//     logWithSource("User.postU", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ================= putU ================= */
// const putU = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz required" });

//     const user = await User.findOne({ tz });
//     if (!user) return res.status(404).json({ ok: false, message: "User not found" });

//     const allowed = User.schema ? new Set(Object.keys(User.schema.paths)) : new Set(info);

//     const body = req.body ?? {};
//     let changed = false;

//     for (const [k, v] of Object.entries(body)) {
//       if (!allowed.has(k) && k !== "password") continue;

//       if (k === "password") {
//         if (v === null || v === undefined || typeof v !== "string" || v.trim() === "") continue;
//         user.password = encryptPassword(v); // pre-save will hash
//         changed = true;
//         continue;
//       }

//       if (k === "roles") {
//         user.roles = Array.isArray(v) ? v : [];
//         changed = true;
//         continue;
//       }

//       // ✅ fix null check
//       if (v === undefined || v === null || v === "") continue;

//       if (k === "birth_date") {
//         const d = toDate(v);
//         if (!d) continue;
//         user.birth_date = d;
//         changed = true;
//         continue;
//       }

//       user.set(k, v);
//       changed = true;
//     }

//     await user.save();

//     if (changed) {
//       await safeNotify({
//         toRoles: ["ادارة"],
//         module: "USERS",
//         action: "UPDATED",
//         title: "تم تعديل مستخدم",
//         message: `تم تعديل المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
//         entity: { kind: "user", id: user._id },
//         meta: { tz: user.tz },
//         createdBy: req.user?._id || null,
//       });
//     }

//     return res.status(200).json({ ok: true, user: sanitize(user) });
//   } catch (err) {
//     logWithSource("User.putU", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ================= deleteU ================= */
// // expects: DELETE /api/users/:tz?from=waiting|active|noActive  (or body.from kept as fallback)
// const deleteU = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

//     const from = String(req.query?.from ?? req.body?.from ?? "active");
//     const Model = roomToModel(from) || User;

//     const deleted = await Model.findOneAndDelete({ tz });
//     if (!deleted) return res.status(404).json({ ok: false, message: "User not found" });

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "DELETED",
//       title: "تم حذف مستخدم",
//       message: `تم حذف المستخدم: ${deleted.firstname || ""} ${deleted.lastname || ""} (${deleted.tz})`,
//       entity: { kind: "user", id: deleted._id },
//       meta: { tz: deleted.tz, from },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, removed: true });
//   } catch (err) {
//     logWithSource("User.deleteU", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ================= getme ================= */
// const getme = async (req, res) => {
//   try {
//     console.log("getme req.user:", req.user);
//     const user = await User.findById(req.user.id).lean();
//     console.log("getme user from DB:", user);
//     if (!user) return res.status(401).json({ code: "USER_NOT_FOUND" });
//     return res.status(200).json({ ok: true, user: sanitize(user) });
//   } catch (err) {
//     logWithSource("User.getme", err);
//     return res.status(500).json({ code: "SERVER_ERROR", message: err.message });
//   }
// };

// const CheckPasswordisGood = async (req, res) => {
//   const { tz, password } = req.body || {};
//   try {
//     if (!tz || !password) return res.status(400).json({ code: "BAD_INPUT", message: "Tz and password are required" });

//     const normTz = String(tz).trim();
//     const user = await User.findOne({ tz: normTz });
//     if (!user) return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid tz or password" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(200).json({ ok: true, PasswordCorrect: false });

//     return res.status(200).json({ ok: true, PasswordCorrect: true });
//   } catch (error) {
//     logWithSource("User.CheckPasswordisGood", error);
//     return res.status(500).json({ ok: false, code: "SERVER_ERROR", message: error.message });
//   }
// };

// /* ================= uploadPhoto ================= */
// const uploadPhoto = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

//     const user = await User.findOne({ tz });
//     if (!user) return res.status(404).json({ ok: false, message: "User not found" });

//     if (!req.file) return res.status(400).json({ ok: false, message: "file is required" });

//     if (user.photo) {
//       try {
//         await deletePhotoC(user.photo);
//       } catch (e) {
//         logWithSource("User.uploadPhoto delete prev", e);
//       }
//     }

//     const uploaded = await uploadPhotoC(req.file, "users");
//     user.photo = uploaded.secure_url;
//     await user.save();

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "PHOTO_UPDATED",
//       title: "تم تحديث صورة مستخدم",
//       message: `تم تحديث صورة المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
//       entity: { kind: "user", id: user._id },
//       meta: { tz: user.tz, photo: true },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, photo: user.photo });
//   } catch (err) {
//     logWithSource("User.uploadPhoto", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };


// /* ================= Forgot/Reset Password ================= */
// function generateOtp6() {
//   return Math.floor(100000 + Math.random() * 900000).toString();
// }

// const MAX_ATTEMPTS = 5;
// const LOCK_MIN = 10;

// const forgotPassword = async (req, res) => {
//   try {
//     const { tz } = req.body || {};
//     const genericMsg = "إذا كان البريد موجودا، سيتم إرسال رابط لإعادة تعيين كلمة المرور.";

//     const normTz = String(tz ?? "").trim();
//     if (!normTz) return res.json({ ok: true, message: genericMsg });

//     const user = await User.findOne({ tz: normTz });
//     if (!user) return res.json({ ok: true, message: genericMsg });

//     if (user.resetOtpLockedUntil && user.resetOtpLockedUntil > new Date()) {
//       return res.json({ ok: true, message: genericMsg });
//     }

//     const otp = generateOtp6();
//     user.resetOtpHash = sha256(otp);
//     user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
//     user.resetOtpAttempts = 0;
//     user.resetOtpLockedUntil = undefined;
//     await user.save();

//     await sendResetPasswordEmail(user.email, otp);

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "FORGOT_PASSWORD",
//       title: "طلب إعادة تعيين كلمة المرور",
//       message: `تم طلب OTP للمستخدم (${user.tz})`,
//       entity: { kind: "user", id: user._id },
//       meta: { tz: user.tz },
//       createdBy: user._id,
//     });

//     return res.json({ ok: true, message: genericMsg });
//   } catch (err) {
//     logWithSource("User.forgotPassword", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// const resetPassword = async (req, res) => {
//   try {
//     const { tz, otp, newPassword, confirmPassword } = req.body || {};

//     const normTz = String(tz ?? "").trim();
//     if (!normTz || !otp || !newPassword) return res.status(400).json({ ok: false, message: "Missing fields" });
//     if (String(otp).length !== 6) return res.status(400).json({ ok: false, message: "OTP must be 6 digits" });
//     if (newPassword !== confirmPassword) return res.status(400).json({ ok: false, message: "Passwords do not match" });

//     const user = await User.findOne({ tz: normTz });
//     if (!user) return res.status(400).json({ ok: false, message: "Invalid or expired code" });

//     if (user.resetOtpLockedUntil && user.resetOtpLockedUntil > new Date()) {
//       return res.status(429).json({ ok: false, message: "Too many attempts. Try later." });
//     }

//     if (!user.resetOtpHash || !user.resetOtpExpires || user.resetOtpExpires <= new Date()) {
//       return res.status(400).json({ ok: false, message: "Invalid or expired code" });
//     }

//     const ok = sha256(String(otp)) === user.resetOtpHash;

//     if (!ok) {
//       user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;
//       if (user.resetOtpAttempts >= MAX_ATTEMPTS) {
//         user.resetOtpLockedUntil = new Date(Date.now() + LOCK_MIN * 60 * 1000);
//       }
//       await user.save();
//       return res.status(400).json({ ok: false, message: "Invalid or expired code" });
//     }

//     user.password = encryptPassword(newPassword); // pre-save will bcrypt
//     user.resetOtpHash = undefined;
//     user.resetOtpExpires = undefined;
//     user.resetOtpAttempts = 0;
//     user.resetOtpLockedUntil = undefined;
//     await user.save();

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "PASSWORD_RESET",
//       title: "تم تغيير كلمة المرور",
//       message: `تم تغيير كلمة مرور المستخدم (${user.tz})`,
//       entity: { kind: "user", id: user._id },
//       meta: { tz: user.tz },
//       createdBy: user._id,
//     });

//     return res.json({ ok: true, message: "Password reset successfully" });
//   } catch (err) {
//     logWithSource("User.resetPassword", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /**
// ملاحظة عربية
// ملاحظة عربية
//  *
//  * GET /users/viewPassword/:tz
//  */
// const viewPassword = async (req, res) => {
//   try {
//     console.log("viewPassword params:", req.params);
//     const tz = String(req.params.tz).trim();
//     if (!tz) return res.status(400).json({ ok: false, message: 'tz is required' });

//     // عربيالجمعةالاثنينالخميس: عربيالخميسالاثنينعربيالأحد الثلاثاءعربي password
//     const user = await User.findOne({ tz }).select('+password');
//     if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

//     const stored = user.password;
//     console.log("Stored password format:", stored, isBcryptHash(stored));
// ملاحظة عربية
//     if (isBcryptHash(stored)) {
//       return res.status(200).json({
//         ok: false,
//         canView: false,
//         algo: 'bcrypt',
//         message: 'Cannot view password for old users (bcrypt is one-way). Use reset instead.',
//       });
//     }
//     console.log(isEncrypted(stored));
// ملاحظة عربية
//     if (isEncrypted(stored)) {
//       const plain = decryptPassword(stored);

// ملاحظة عربية
//       // logWithSource(`ADMIN viewed password for tz=${tz}`);

//       return res.status(200).json({
//         ok: true,
//         canView: true,
//         algo: 'enc',
// ملاحظة عربية
//       });
//     }

//     return res.status(400).json({
//       ok: false,
//       canView: false,
//       algo: 'unknown',
//       message: 'Unknown password format',
//     });
//   } catch (err) {
//     return res.status(500).json({ ok: false,
//       canView: false,
//       algo: 'unknown', message: err.message});

//   }
// };

// module.exports = {
//   viewPassword,
//   uploadPhoto,
//   CheckPasswordisGood,
//   register,
//   login,
//   refreshAccessToken,
//   logout,
//   getme,
//   getAllU,
//   getOneU,
//   postU,
//   putU,
//   deleteU,
//   changeRoom,
//   forgotPassword,
//   resetPassword,
// };
