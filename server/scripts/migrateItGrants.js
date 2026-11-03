// One-time cleanup of IT keys stored as everyday grants/revokes:
// "node scripts/migrateItGrants.js" lists them (read-only);
// "node scripts/migrateItGrants.js --apply" removes only the IT keys from
// permissionGrants and permissionRevokes (every room, never the system
// account) and records one audit row per changed user.
// A module key that also holds everyday leaves (e.g. "users") is replaced by
// its everyday leaves, so nothing else changes.
const path = require("path");
const { IT_KEYS, PERMISSION_TREE, expandKeys, isSystemTz } = require("../utils/permissions");

const FIELDS = ["permissionGrants", "permissionRevokes"];

// -> { list: entries left, removed: IT entries } for one stored list
function splitList(stored) {
  const list = [];
  const removed = [];
  for (const entry of Array.isArray(stored) ? stored : []) {
    const key = String(entry ?? "").trim();
    const leaves = [...expandKeys([key])];
    const itLeaves = leaves.filter((leaf) => IT_KEYS.has(leaf));
    if (itLeaves.length === 0) {
      list.push(entry);
      continue;
    }
    removed.push(key);
    // Keep the everyday leaves of a mixed module key, in the module's order.
    if (Object.hasOwn(PERMISSION_TREE, key)) {
      for (const leaf of leaves) if (!IT_KEYS.has(leaf) && !list.includes(leaf)) list.push(leaf);
    }
  }
  return { list, removed };
}

// users: [{ tz, room, permissionGrants, permissionRevokes }]
// -> [{ tz, room, keys, patch }] (patch: the cleaned lists)
function planItGrants(users) {
  const plan = [];
  for (const user of Array.isArray(users) ? users : []) {
    if (isSystemTz(user?.tz)) continue; // the system account's grants are never read
    const patch = {};
    const keys = new Set();
    for (const field of FIELDS) {
      const { list, removed } = splitList(user?.[field]);
      patch[field] = list;
      removed.forEach((key) => keys.add(key));
    }
    if (keys.size) plan.push({ tz: user.tz, room: user.room, keys: [...keys].sort(), patch });
  }
  return plan;
}

function findItGrants(users) {
  return planItGrants(users).map(({ tz, room, keys }) => ({ tz, room, keys }));
}

// Read-only unless apply is true. -> { found, changed, skipped }
// Writes never create a user: one that no longer exists is skipped (no audit row).
async function clearItGrants(users, { model, audit, apply = false } = {}) {
  const plan = planItGrants(users);
  const found = plan.map(({ tz, room, keys }) => ({ tz, room, keys }));
  if (!apply) return { found, changed: 0, skipped: [] };

  const byTz = new Map(users.map((u) => [`${u.room}:${u.tz}`, u]));
  let changed = 0;
  const skipped = [];
  for (const { tz, room, patch } of plan) {
    const user = byTz.get(`${room}:${tz}`);
    const response = await model.updateExisting({ tz }, patch, room);
    if (response && response.success === false) throw new Error(`Update failed for ${tz} (${room})`);
    if (!response?.result) {
      skipped.push({ tz, room });
      continue;
    }
    changed += 1;
    await audit.record(
      { actor: { isSystem: true } },
      {
        module: "users",
        action: "it_grants_cleared",
        targetType: "user",
        targetId: tz,
        targetLabel: [user?.firstname, user?.lastname].filter(Boolean).join(" ") || tz,
        before: Object.fromEntries(FIELDS.map((f) => [f, user?.[f] ?? []])),
        after: patch,
      },
    );
  }
  return { found, changed, skipped };
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const { UserModelDef } = require("../Entities/User/User.model");
  const { audit } = require("../utils/audit");

  const apply = process.argv.includes("--apply");
  const users = [];
  for (const room of Object.keys(UserModelDef.collections)) {
    const docs = (await UserModelDef.get({}, room)).result || [];
    for (const doc of docs) users.push({ ...doc, room });
  }

  const { found, changed, skipped } = await clearItGrants(users, { model: UserModelDef, audit, apply });
  if (!found.length) {
    console.log("No stored IT-key grants. Nothing to do.");
    return 0;
  }
  for (const { tz, room, keys } of found) console.log(`${room}: ${tz} ${keys.join(", ")}`);
  for (const { tz, room } of skipped) console.log(`Skipped (no longer exists): ${room}: ${tz}`);
  console.log(apply ? `Cleared IT keys for ${changed} user(s).` : "Dry run. Run again with --apply to remove them.");
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("Failed to migrate IT grants:", err.message);
      process.exit(1);
    });
}

module.exports = { findItGrants, clearItGrants, planItGrants };
