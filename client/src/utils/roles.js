// Role names and ranks; mirrors ROLE_RANK / normalizeRole in server/utils/permissions.js.
import { repairMisencodedText } from "./textEncoding";

export const ROLES = ["ادارة", "مرشد", "مساعد"];
export const ROLE_RANK = { "ادارة": 3, "مرشد": 2, "مساعد": 1 };

const ALIASES = {
  "ادارة": "ادارة", "إدارة": "ادارة", "الادارة": "ادارة", "الإدارة": "ادارة",
  "مرشد": "مرشد", "مرشدة": "مرشد", "المرشد": "مرشد", "المرشدة": "مرشد",
  "مساعد": "مساعد", "مساعدة": "مساعد", "المساعد": "مساعد", "المساعدة": "مساعد",
};

export const normalizeRole = (raw) => {
  if (typeof raw !== "string") return null;
  const cleaned = String(repairMisencodedText(raw)).trim();
  return Object.hasOwn(ALIASES, cleaned) ? ALIASES[cleaned] : null;
};

export const resolveRole = (user) => {
  const direct = normalizeRole(user?.role);
  if (direct) return direct;
  let best = null;
  for (const raw of Array.isArray(user?.roles) ? user.roles : []) {
    const role = normalizeRole(raw);
    if (role && (!best || ROLE_RANK[role] > ROLE_RANK[best])) best = role;
  }
  return best;
};

// Roles the signed-in user may give (approve, create, change): only roles
// ranked strictly below his own, all of them for the system account. Hides
// UI only; the server decides.
export const assignableRoles = ({ role, isSystem = false } = {}) => {
  if (isSystem === true) return [...ROLES];
  const own = ROLE_RANK[normalizeRole(role)] || 0;
  return ROLES.filter((r) => ROLE_RANK[r] < own);
};

// Mirrors canManageTarget (server/utils/permissionRules.js) to hide actions
// the server would refuse; the server decides. viewer: { id?, tz?, role,
// isSystem? }; target: a user record (role / roles, _id, tz). A target with no
// known role ranks 0.
export const canManageTargetClient = (viewer, target) => {
  if (!viewer || !target) return false;
  if (viewer.isSystem === true) return true;
  const sameId = Boolean(viewer.id) && Boolean(target._id) && String(viewer.id) === String(target._id);
  const sameTz = Boolean(viewer.tz) && Boolean(target.tz) && String(viewer.tz) === String(target.tz);
  if (sameId || sameTz) return false;
  const own = ROLE_RANK[normalizeRole(viewer.role)] || 0;
  const theirs = ROLE_RANK[resolveRole(target)] || 0;
  return theirs < own;
};

export const isDemotion =(from, to) => {
  const a = ROLE_RANK[normalizeRole(from)];
  const b = ROLE_RANK[normalizeRole(to)];
  return Boolean(a) && Boolean(b) && b < a;
};

// i18n keys of the role names (roles.* in I18nContext).
export const ROLE_LABEL_KEY = { "ادارة": "roles.admin", "مرشد": "roles.guide", "مساعد": "roles.assistantGuide" };
