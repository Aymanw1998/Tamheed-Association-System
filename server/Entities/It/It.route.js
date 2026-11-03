const express = require("express");
const auth = require("./It.auth");
const sitePass = require("./sitePass");
const { requireIt: defaultRequireIt, requireItHost } = require("../../middleware/requireIt");
const { requirePermission } = require("../../middleware/permissionMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");
const itMembers = require("./ItMembers.controller");
const { createAuditRouter } = require("../Audit/Audit.route");

const { requireSystemIt } = itMembers;

// Handlers of a module loaded on first request, so requiring this router
// (tests, server start order) does not pull in the database layer early.
const lazyHandlers = (load) => new Proxy({}, {
  get: (_, name) => (req, res, next) => load()[name](req, res, next),
});
// A router built on its first request.
const lazyRouter = (build) => {
  let router = null;
  return (req, res, next) => (router || (router = build()))(req, res, next);
};

// Per IP; the password lockout and the code's five tries still stop guessing.
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, scope: "it-login" });
// System account recovery emails a temporary password: at most 3 an hour.
const recoverRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, scope: "system-recover" });

// The IT site's API (IT-site design, "Who may do what"). Every route below the
// sign-in ones takes requireIt: the IT session, an IT user not blocked (or the
// system account), on IT_HOST. The user handlers are the everyday ones,
// judged with the IT actor by the same rules (utils/permissionRules.js).
// deps (tests): requireIt, users (User.controller), members
// (createItMembers), lockedUser, auditModel, drive, driveState, locks, push.
function createItRouter(deps = {}) {
  const requireIt = deps.requireIt || defaultRequireIt;
  const users = deps.users || lazyHandlers(() => require("../User/User.controller"));
  const members = deps.members || itMembers;
  const roleDefaults = deps.roleDefaults || lazyHandlers(() => require("./RoleDefaults.controller").roleDefaults());
  // Refuses a change while the user is open in an everyday tab (423).
  const lockedUser = deps.lockedUser || ((req, res, next) => require("../User/User.route").lockedUser(req, res, next));

  const auditRouter = lazyRouter(() => createAuditRouter({
    model: deps.auditModel || require("../Audit/Audit.model").AuditModelDef,
    loadActor: requireIt,
  }));
  const driveRouter = lazyRouter(() => {
    const google = require("../Storage/GoogleDrive.route");
    return google.createGoogleDriveRouter({
      drive: deps.drive || require("../../services/googleDrive.service"),
      state: deps.driveState || google.driveState(),
      requireAuth: requireIt,
      withCallback: false,
      site: "it",
    });
  });
  const lockRouter = lazyRouter(() => require("../Lock/Lock.route").createLockAdminRouter({
    loadActor: requireIt,
    requirePermission,
    locks: deps.locks || require("../Lock/Lock.route").locks,
  }));
  const pushRouter = lazyRouter(() => require("../Push/Push.route").createPushSettingsRouter({
    loadActor: requireIt,
    requirePermission,
    push: deps.push || require("../../utils/push").push,
  }));

  const router = express.Router();

  // Only IT_HOST reaches any IT route; every other host gets 404.
  router.use(requireItHost);

  router.post("/login", loginLimit, auth.login);
  router.post("/verify", loginLimit, auth.verify);
  // Everyday app → IT site: a one-time pass replaces the password step only.
  router.post("/login-pass", loginLimit, sitePass.loginToIt);
  router.post("/logout", auth.logout);
  router.get("/me", requireIt, auth.me);
  // IT site → everyday app: a one-time pass for a user with an everyday role.
  router.post("/system-pass", requireIt, sitePass.systemPass);

  // Users («المستخدمون») and the user page.
  router.get("/users", requireIt, requirePermission("users.view"), members.listUsers);
  router.get("/users/:tz", requireIt, requirePermission("users.view"), users.getOneU);
  router.put("/users/:tz/role", requireIt, requirePermission("users.changeRole"), lockedUser, users.putRole);
  // Account state: { from, to } between active / waiting / noActive (role for
  // an approval); delete with ?from=<room>. Never another IT user (canManageTarget).
  router.post("/users/:tz/room", requireIt, requirePermission("users.approve"), lockedUser, users.changeRoom);
  router.delete("/users/:tz", requireIt, requirePermission("users.delete"), lockedUser, users.deleteU);
  router.get("/users/:tz/permissions", requireIt, requirePermission("permissions.manage"), users.getPermissions);
  router.put("/users/:tz/permissions", requireIt, requirePermission("permissions.manage"), lockedUser, users.putPermissions);
  router.get("/users/:tz/password", requireIt, requirePermission("users.passwords"), users.viewPassword);
  router.put("/users/:tz/password", requireIt, requirePermission("users.resetPassword"), lockedUser, users.resetUserPassword);
  router.post("/users/:tz/unlock", requireIt, requirePermission("users.unlock"), lockedUser, users.unlockUser);
  router.get("/users/:tz/sessions", requireIt, requirePermission("users.unlock"), users.listUserDevices);
  router.delete("/users/:tz/sessions/:sid", requireIt, requirePermission("users.unlock"), users.signOutUserDevice);

  // «صلاحيات الأدوار»: each everyday role's default permissions, any IT user.
  router.get("/role-defaults", requireIt, requirePermission("permissions.manage"), roleDefaults.list);
  router.put("/role-defaults/:role", requireIt, requirePermission("permissions.manage"), roleDefaults.save);
  router.delete("/role-defaults/:role", requireIt, requirePermission("permissions.manage"), roleDefaults.reset);

  // The session and permission checks run first: others never use up the budget.
  router.post("/system/recover", requireIt, requirePermission("systemRecovery.reset"), recoverRateLimit, users.recoverSystem);

  // Audit log, Drive connection, «الإعدادات»: each router loads the actor with requireIt.
  router.use("/audit", auditRouter);
  router.use("/storage/google", driveRouter);
  router.use("/locks", lockRouter);
  router.use("/push", pushRouter);

  // IT users: the system account only.
  router.get("/members", requireIt, requireSystemIt, members.list);
  router.post("/members/:tz", requireIt, requireSystemIt, members.add);
  router.delete("/members/:tz", requireIt, requireSystemIt, members.remove);
  router.post("/members/:tz/block", requireIt, requireSystemIt, members.block);
  router.post("/members/:tz/unblock", requireIt, requireSystemIt, members.unblock);

  return router;
}

module.exports = createItRouter();
module.exports.createItRouter = createItRouter;
