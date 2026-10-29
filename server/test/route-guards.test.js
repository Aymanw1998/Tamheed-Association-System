const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// Static check over every router file: role checks are gone, and every route
// is guarded by a permission (or a self-check) unless it is listed below as
// deliberately public / differently guarded.
const SERVER = path.join(__dirname, "..");
const ENTITIES = path.join(SERVER, "Entities");

const ROUTE_FILES = [
  ...fs.readdirSync(ENTITIES).flatMap((dir) => {
    const full = path.join(ENTITIES, dir);
    if (!fs.statSync(full).isDirectory()) return [];
    return fs.readdirSync(full).filter((f) => f.endsWith(".route.js")).map((f) => path.join(full, f));
  }),
  path.join(SERVER, "routes", "ai.routes.js"),
  path.join(SERVER, "routes", "tours.routes.js"),
];

// Whole files outside the permission system.
const EXCLUDED_FILES = new Set([
  // Loopback-only internal storage backend (its own trust boundary), and the
  // signed-JWT /file/:name link the browser follows.
  "Storage/CentralStorageBackend.route.js",
  // Google Drive connect: only the system account (kept as is); /callback is
  // Google's public OAuth redirect, guarded by a one-time state.
  "Storage/GoogleDrive.route.js",
]);

// Individual routes that stay public or keep their own guard. "METHOD path".
const PUBLIC_ROUTES = {
  "User/Auth.route.js": [
    "POST /register/",
    "POST /login",
    "POST /logout", // requireAuth only: signing out must always work
    "POST /me", // requireAuth only: getme answers USER_NOT_FOUND, which the client uses to reset to login
    "POST /refresh",
    "POST /forgot-password",
    "POST /reset-password",
  ],
  "InviteToken/InviteToken.route.js": [
    "GET /validate/:token",
    "POST /submit/:token",
  ],
  "Storage/Storage.route.js": [
    "GET /open-signed", // signed, time-limited link
    "GET /download-signed",
  ],
  // EventSource cannot send the Authorization header: the stream is opened
  // with a single-use 60 s ticket from POST /ticket, and the handler re-loads
  // the user (active, not locked) exactly as loadActor does before streaming.
  "Live/Live.route.js": ["GET /stream"],
  // Student sport site (sign-in, me, photo): its own cookie and requireSportStudent, never staff auth.
  "SportPortal/SportPortal.route.js": ["POST /request-code", "POST /verify", "POST /logout", "GET /me", "GET /photo", "GET /id", "GET /live", "POST /push/subscribe", "DELETE /push/subscribe"],
  // The VAPID public key the browser needs before it can subscribe; nothing private.
  "Push/Push.route.js": ["GET /key"],
};

// Routes any active signed-in user may call (loadActor, no key): the
// controller scopes the answer to the caller.
const ANY_ACTOR_ROUTES = {
  "Report/Report.route.js": ["GET /", "GET /:id"], // reports.viewAll checked in the controller
  // The dashboard summary checks, per part, the permission of that part's own route.
  "Dashboard/Dashboard.route.js": ["GET /summary"],
  "Vehicle/Vehicle.route.js": ["GET /me/permissions", "GET /alerts"], // own permissions / assigned vehicles
  "User/Auth.route.js": ["POST /change-password"], // one's own password; checks the current one
  "Live/Live.route.js": ["POST /ticket"], // a ticket for one's own live channel
  // One's own alert inbox: every query is filtered by the caller's tz.
  "Alert/Alert.route.js": ["GET /", "POST /read-all", "POST /:id/read"],
  // One's own push subscription: stored and removed under the caller's tz.
  "Push/Push.route.js": ["POST /subscribe", "DELETE /subscribe"],
  // Item locks: any signed-in user; the holder is their browser tab. The
  // force-release route is the only one with a permission (EXACT_GUARDS).
  "Lock/Lock.route.js": ["POST /acquire", "POST /heartbeat", "POST /release", "GET /:key"],
  // One's own tour state: every write targets the caller's own record.
  "routes/tours.routes.js": ["GET /", "POST /item/:id", "POST /known-keys", "POST /releases/seen"],
};

// Router files outside Entities/ are named "routes/<file>" by rel().
const fileOf = (name) => (name.startsWith("routes/") ? path.join(SERVER, name) : path.join(ENTITIES, name));

const rel = (file) => path.relative(ENTITIES, file).split(path.sep).join("/").replace(/^\.\.\/routes\//, "routes/");

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

function routesOf(source) {
  const routes = [];
  const pattern = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2([\s\S]*?)\);/g;
  let match;
  while ((match = pattern.exec(source))) {
    routes.push({ method: match[1].toUpperCase(), path: match[3], chain: match[4] });
  }
  return routes;
}

const GUARD = /requirePermission\(|requireSelfOr\(|requireVehiclePermission\(/;

test("no role-based guard remains in any router", () => {
  for (const file of ROUTE_FILES) {
    const source = stripComments(fs.readFileSync(file, "utf8"));
    for (const banned of ["requireRole(", "protectRole(", "requireSelfOrRole(", "protectSelfOrRole(", "requireAdmin"]) {
      assert.ok(!source.includes(banned), `${rel(file)} still uses ${banned}`);
    }
  }
});

test("every non-public route loads the actor and checks a permission", () => {
  let checked = 0;
  for (const file of ROUTE_FILES) {
    const name = rel(file);
    if (EXCLUDED_FILES.has(name)) continue;
    const source = stripComments(fs.readFileSync(file, "utf8"));
    const usesLine = source.split("\n").filter((line) => /router\.use\(/.test(line)).join("\n");
    const fileLoadsActor = /loadActor/.test(usesLine);
    const publicRoutes = new Set(PUBLIC_ROUTES[name] || []);
    const anyActor = new Set(ANY_ACTOR_ROUTES[name] || []);

    for (const route of routesOf(source)) {
      const key = `${route.method} ${route.path}`;
      if (publicRoutes.has(key)) continue;
      checked += 1;
      assert.ok(fileLoadsActor || /loadActor/.test(route.chain), `${name} ${key} does not load the actor`);
      if (anyActor.has(key)) continue;
      assert.ok(GUARD.test(route.chain), `${name} ${key} has no permission guard`);
    }
  }
  assert.ok(checked > 60, `expected to check every route, checked ${checked}`);
});

test("every listed exception still exists (the exclusion lists are not stale)", () => {
  for (const [name, list] of [...Object.entries(PUBLIC_ROUTES), ...Object.entries(ANY_ACTOR_ROUTES)]) {
    const source = stripComments(fs.readFileSync(fileOf(name), "utf8"));
    const present = new Set(routesOf(source).map((r) => `${r.method} ${r.path}`));
    for (const key of list) assert.ok(present.has(key), `${name} ${key} is listed as public but not found`);
  }
});

// Sensitive routes are guarded by exactly this key (the first argument of
// requirePermission must be this string literal).
const EXACT_GUARDS = {
  "User/User.route.js": {
    "GET /viewPassword/:tz": "users.passwords",
    "PATCH /:tz/storage-permissions": "files.manageAll",
    "GET /:tz/permissions": "permissions.manage",
    "PUT /:tz/permissions": "permissions.manage",
    "PUT /:tz/role": "users.changeRole",
    "POST /:tz/unlock": "users.unlock",
    "POST /changeStatus/:tz": "users.approve",
    "DELETE /:tz/:from": "users.delete",
    "POST /": "users.create",
    "POST /system/recover": "systemRecovery.reset",
  },
  "Vehicle/Vehicle.route.js": { "DELETE /:id": "vehicles.delete" },
  "Lock/Lock.route.js": { "POST /force-release": "permissions.manage" },
  "Notice/Notice.route.js": { "POST /:id/archive": "notices.post" },
  "Lesson/Lesson.route.js": {
    "POST /copy-month": "lessons.copyMonth",
    "DELETE /delete-perMonth/:month/:year": "lessons.copyMonth",
  },
  "Student/Student.route.js": {
    "DELETE /:tz": "students.delete",
    "GET /lookup/:tz": "lessons.roster", // exact-tz lookup to add a student to a roster
  },
};

test("sensitive routes are guarded by exactly the expected permission key", () => {
  for (const [name, table] of Object.entries(EXACT_GUARDS)) {
    const source = stripComments(fs.readFileSync(path.join(ENTITIES, name), "utf8"));
    const routes = new Map(routesOf(source).map((r) => [`${r.method} ${r.path}`, r.chain]));
    for (const [key, permission] of Object.entries(table)) {
      assert.ok(routes.has(key), `${name} ${key} not found`);
      const match = routes.get(key).match(/requirePermission\(\s*(['"`])([^'"`]+)\1\s*\)/);
      assert.ok(match, `${name} ${key} is not guarded by a literal requirePermission key`);
      assert.equal(match[2], permission, `${name} ${key}`);
    }
  }
});

test("the legacy role helpers are gone", () => {
  const auth = require("../middleware/authMiddleware");
  assert.equal(auth.requireRole, undefined);
  assert.equal(auth.requireSelfOrRole, undefined);
  assert.equal(require("../utils/vehicleRules").isAdminUser, undefined);
  assert.equal(require("../utils/permissions").canByRole, undefined);
  for (const file of [
    "Entities/Report/Report.controller.js",
    "Entities/Storage/Storage.controller.js",
    "Entities/User/User.controller.js",
    "Entities/Notice/Notice.controller.js",
    "Entities/Notice/Notice.service.js",
    "Entities/Vehicle/Vehicle.controller.js",
    "middleware/authMiddleware.js",
    "utils/vehicleRules.js",
  ]) {
    const source = stripComments(fs.readFileSync(path.join(SERVER, file), "utf8"));
    assert.ok(!/isAdminUser|ADMIN_ROLES|ADMIN_ROLE_NAMES/.test(source), `${file} still has an admin-role check`);
  }
});
