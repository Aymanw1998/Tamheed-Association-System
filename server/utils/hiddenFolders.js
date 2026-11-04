const { isHiddenUser } = require("./permissions");

// The storage folders of those who work unseen (a folder's name is an ID number).
const clean = (value) => String(value || "").replace(/^\/+|\/+$/g, "");

function hiddenFolderSet(users, foldersOf) {
  const set = new Set();
  for (const user of users || []) {
    if (!isHiddenUser(user)) continue;
    for (const folder of foldersOf(user)) if (clean(folder)) set.add(clean(folder));
  }
  return set;
}

// That folder itself, or anything inside it.
function inHiddenFolder(itemPath, set) {
  const p = clean(itemPath);
  if (!p) return false;
  for (const folder of set) if (p === folder || p.startsWith(`${folder}/`)) return true;
  return false;
}

module.exports = { hiddenFolderSet, inHiddenFolder };
