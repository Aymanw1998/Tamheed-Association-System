const { can, effectivePermissions, isSystemTz } = require("../utils/permissions");

// Who may hear about a change to a storage entry: the owner of the user folder
// it sits in (and the entry's recorded owner), everyone it or a parent folder
// is shared with, and every active holder of files.manageAll. Never the system
// account, and only active users. Lookups are injected so this is testable:
//   listActiveUsers()        -> active user records
//   findEntriesByPath(path)  -> storage metadata rows at that client path
//   folderCandidatesOf(user) -> client paths of that user's own folder(s)
const normalize = (value) => String(value ?? "").replace(/\\/g, "/").split("/").filter(Boolean).join("/");

// "a/b/c" -> ["a/b/c", "a/b", "a"]
function selfAndAncestors(clientPath) {
  const parts = normalize(clientPath).split("/").filter(Boolean);
  return parts.map((_, i) => parts.slice(0, parts.length - i).join("/"));
}

const inFolder = (clientPath, folder) => {
  const p = normalize(clientPath);
  const f = normalize(folder);
  return Boolean(f) && (p === f || p.startsWith(`${f}/`));
};

function createStorageRecipients({ listActiveUsers, findEntriesByPath, folderCandidatesOf, systemTz } = {}) {
  return async function storageRecipients(clientPaths = [], { extraTzs = [] } = {}) {
    const sysTz = systemTz === undefined ? process.env.SYSTEM_ADMIN_TZ : systemTz;
    const users = (await listActiveUsers()).filter((u) => u?.tz && !isSystemTz(String(u.tz), sysTz));
    const tzByIdentifier = new Map();
    for (const user of users) {
      const tz = String(user.tz);
      tzByIdentifier.set(tz, tz);
      if (user._id) tzByIdentifier.set(String(user._id), tz);
    }

    const out = new Set();
    const add = (identifier) => {
      const tz = tzByIdentifier.get(String(identifier ?? "").trim());
      if (tz) out.add(tz);
    };

    const paths = [...new Set(clientPaths.map(normalize).filter(Boolean))];
    for (const user of users) {
      const folders = folderCandidatesOf(user) || [];
      if (paths.some((p) => folders.some((f) => inFolder(p, f)))) add(user.tz);
      if (can(effectivePermissions(user), "files.manageAll")) add(user.tz);
    }

    const looked = new Set();
    for (const p of paths) {
      for (const candidate of selfAndAncestors(p)) {
        if (looked.has(candidate)) continue;
        looked.add(candidate);
        for (const entry of (await findEntriesByPath(candidate)) || []) {
          add(entry?.ownerId);
          for (const share of Array.isArray(entry?.sharedWith) ? entry.sharedWith : []) add(share?.userId);
        }
      }
    }

    for (const tz of extraTzs) add(tz);
    return [...out];
  };
}

module.exports = { createStorageRecipients, selfAndAncestors };
