// The IT site's users list, and the IT users themselves (IT-site design,
// "Screens of the IT site" 2 and 4). Members are managed by the system
// account only: add marks an existing active user as IT (a real email is
// required), remove takes him out of IT, block stops only his IT sign-in. The
// everyday account is unchanged by any of them; the system account itself is
// never removed or blocked. Each change writes an audit row, module "it".
const { hasRealEmail, isItUser, isSystemTz, resolveRole } = require("../../utils/permissions");
const { logWithSource } = require("../../middleware/logger");

const ROOMS = ["active", "waiting", "noActive"];
const FORBIDDEN = { ok: false, code: "FORBIDDEN", message: "لا توجد صلاحية" };
const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "غير موجود" };
const SYSTEM_ACCOUNT = { ok: false, code: "SYSTEM_ACCOUNT", message: "لا يمكن إزالة حساب النظام أو حظره" };
const NO_REAL_EMAIL = { ok: false, code: "NO_REAL_EMAIL", message: "لا يمكن ضمّ مستخدم إلى IT بلا بريد إلكتروني حقيقي" };
const ALREADY_IT = { ok: false, code: "ALREADY_IT", message: "المستخدم من IT مسبقًا" };
const NOT_IT = { ok: false, code: "NOT_IT", message: "المستخدم ليس من IT" };
const BAD_ROOM = { ok: false, code: "BAD_ROOM" };
const SERVER_ERROR = { ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" };

// Only these fields leave the server (no password, hashes, codes or devices).
const userRow = (user, room) => ({
  tz: String(user.tz ?? ""),
  firstname: user.firstname || "",
  lastname: user.lastname || "",
  role: resolveRole(user),
  isIT: isItUser(user),
  photo: user.photo || null,
  lockedAt: user.lockedAt || null,
  room,
});

const memberRow = (user) => ({
  tz: String(user.tz ?? ""),
  firstname: user.firstname || "",
  lastname: user.lastname || "",
  role: resolveRole(user),
  photo: user.photo || null,
  itSince: user.itSince || null,
  itBlockedAt: user.itBlockedAt || null,
});

const membership = (user) => ({
  tz: user.tz,
  firstname: user.firstname,
  lastname: user.lastname,
  isIT: isItUser(user),
  itSince: user.itSince ?? null,
  itBlockedAt: user.itBlockedAt ?? null,
});

// After requireIt: the members routes answer only the system account.
function requireSystemIt(req, res, next) {
  return req.actor?.it === true && req.actor.isSystem === true ? next() : res.status(403).json(FORBIDDEN);
}

function createItMembers(deps = {}) {
  const {
    users: usersDep,
    audit: auditDep,
    notify: notifyDep,
    systemTz = () => process.env.SYSTEM_ADMIN_TZ,
    now = () => new Date(),
    log = logWithSource,
  } = deps;
  // Loaded on first use, so requiring this file does not open the database.
  const users = () => usersDep || require("../User/User.model").UserModelDef;
  const audit = () => auditDep || require("../../utils/audit").audit;
  const notify = (...args) => (notifyDep || require("../../services/liveHub").notifyChange)(...args);

  const isSystem = (tz) => isSystemTz(String(tz ?? ""), systemTz());
  const listRoom = async (room) => {
    const found = await users().get({}, room);
    return found?.success && Array.isArray(found.result) ? found.result : [];
  };
  const findActive = async (tz) => {
    const found = await users().get({ tz }, "active");
    return found?.success && Array.isArray(found.result) && found.result.length === 1 ? found.result[0] : null;
  };
  const guard = (name, fn) => async (req, res) => {
    try {
      return await fn(req, res);
    } catch (error) {
      log(`ItMembers.${name}`, error);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  // GET /api/it/users?room=: every room unless one is named; never the system account.
  const listUsers = guard("listUsers", async (req, res) => {
    const room = typeof req.query?.room === "string" && req.query.room ? req.query.room : null;
    if (room && !ROOMS.includes(room)) return res.status(400).json(BAD_ROOM);
    const rooms = room ? [room] : ROOMS;
    const lists = await Promise.all(rooms.map(listRoom));
    const rows = rooms.flatMap((r, i) => lists[i].filter((u) => !isSystem(u.tz)).map((u) => userRow(u, r)));
    return res.status(200).json({ ok: true, users: rows });
  });

  // GET /api/it/members: the IT users (active room), blocked ones included.
  const list = guard("list", async (req, res) => {
    const rows = (await listRoom("active")).filter((u) => isItUser(u) && !isSystem(u.tz)).map(memberRow);
    return res.status(200).json({ ok: true, members: rows });
  });

  // Loads :tz for a member change: never the system account, only active users.
  const target = async (req, res) => {
    const tz = String(req.params?.tz ?? "").trim();
    if (isSystem(tz)) { res.status(403).json(SYSTEM_ACCOUNT); return null; }
    const user = tz ? await findActive(tz) : null;
    if (!user) { res.status(404).json(NOT_FOUND); return null; }
    return user;
  };

  const write = async (req, user, action, patch) => {
    const after = { ...user, ...patch };
    await users().update({ tz: user.tz }, { ...patch, updatedAt: now() }, "active");
    await audit().record(req, {
      module: "it", action, targetType: "user", targetId: user.tz,
      targetLabel: `${user.firstname || ""} ${user.lastname || ""}`.trim() || String(user.tz),
      before: membership(user), after: membership(after),
    });
    notify("user", user._id);
    return after;
  };

  // POST /api/it/members/:tz: marks an existing active user as IT.
  const add = guard("add", async (req, res) => {
    const user = await target(req, res);
    if (!user) return undefined;
    if (isItUser(user)) return res.status(409).json(ALREADY_IT);
    if (!hasRealEmail(user)) return res.status(400).json(NO_REAL_EMAIL);
    const after = await write(req, user, "member_add", { isIT: true, itSince: now(), itBlockedAt: null });
    return res.status(200).json({ ok: true, member: memberRow(after) });
  });

  // DELETE /api/it/members/:tz: out of IT; his IT sessions end at once.
  const remove = guard("remove", async (req, res) => {
    const user = await target(req, res);
    if (!user) return undefined;
    if (!isItUser(user)) return res.status(409).json(NOT_IT);
    await write(req, user, "member_remove", { isIT: false, itBlockedAt: null, itSignedOutAt: now() });
    return res.status(200).json({ ok: true });
  });

  // POST /api/it/members/:tz/block: no IT sign-in until unblocked; the
  // sessions from before the block stay ended after it (itSignedOutAt).
  const block = guard("block", async (req, res) => {
    const user = await target(req, res);
    if (!user) return undefined;
    if (!isItUser(user)) return res.status(409).json(NOT_IT);
    const at = now();
    const after = await write(req, user, "member_block", { itBlockedAt: user.itBlockedAt || at, itSignedOutAt: at });
    return res.status(200).json({ ok: true, member: memberRow(after) });
  });

  // POST /api/it/members/:tz/unblock: he may sign in to the IT site again.
  const unblock = guard("unblock", async (req, res) => {
    const user = await target(req, res);
    if (!user) return undefined;
    if (!isItUser(user)) return res.status(409).json(NOT_IT);
    const after = await write(req, user, "member_unblock", { itBlockedAt: null });
    return res.status(200).json({ ok: true, member: memberRow(after) });
  });

  return { listUsers, list, add, remove, block, unblock };
}

module.exports = { ...createItMembers(), createItMembers, requireSystemIt };
