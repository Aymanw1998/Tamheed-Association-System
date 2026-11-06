// Mirror of PERMISSION_TREE and IT_KEYS in server/utils/permissions.js. Keep both in step.
export const PERMISSION_TREE = {
  dashboard: ["view"], calendar: ["view"],
  students: ["view", "viewAll", "create", "edit", "delete", "photo", "parentLink"],
  lessons: ["view", "viewAll", "create", "edit", "roster", "delete", "copyMonth"],
  attendance: ["view", "record"],
  tasks: ["manage"],
  reports: ["create", "editOwn", "viewAll", "editAll", "delete", "exportPdf"],
  vehicles: ["view", "edit", "compliance", "documents", "archive", "delete"],
  files: ["use", "manageAll"],
  notices: ["view", "post", "runCheck"],
  users: ["view", "create", "edit", "approve", "delete", "changeRole", "passwords", "unlock", "resetPassword"],
  ai: ["use"], permissions: ["manage"], audit: ["view"], systemRecovery: ["reset"],
  sports: ["view", "coach", "manage"], finance: ["view"],
  storage: ["drive"],
};

export const ALL_KEYS = Object.entries(PERMISSION_TREE).flatMap(([module, leaves]) =>
  leaves.map((leaf) => `${module}.${leaf}`));

// What only the IT site does; no everyday permission set holds one.
export const IT_KEYS = new Set([
  "permissions.manage", "users.passwords", "users.unlock",
  "audit.view", "storage.drive", "systemRecovery.reset",
]);

// A leaf key needs that leaf; a module key needs every leaf of the module.
export const hasPermission = (permissions, key) => {
  if (!Array.isArray(permissions) || typeof key !== "string" || !key) return false;
  if (Object.hasOwn(PERMISSION_TREE, key)) {
    return PERMISSION_TREE[key].every((leaf) => permissions.includes(`${key}.${leaf}`));
  }
  return ALL_KEYS.includes(key) && permissions.includes(key);
};
