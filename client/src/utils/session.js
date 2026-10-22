import { repairMisencodedText } from "./textEncoding";
import { hasPermission } from "./permissionKeys";
import { resolveRole } from "./roles";

export const ADMIN_ROLES = ["ادارة", "إدارة", "الادارة", "الإدارة"];
export const GUIDE_ROLES = ["مرشد", "مرشدة", "المرشد", "المرشدة"];

const repairRole = (role) => repairMisencodedText(String(role || "").trim());

export const normalizeRoles = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(repairRole);
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(repairRole);
    } catch (error) {
      // Not JSON: older logins stored roles as "a,b".
    }

    return value.split(",").map(repairRole).filter(Boolean);
  }

  return [];
};

// Saves who is signed in for the pages that check roles. Called on login and
// after every /auth/me check, so a session restored from the refresh cookie
// (after local storage was cleared) gets its roles back.
export const rememberSessionUser = (user) => {
  if (!user) return;
  if (user._id) localStorage.setItem("user_id", String(user._id));
  if (user.tz) localStorage.setItem("user_tz", String(user.tz));
  if (typeof user.gender === "string" && user.gender) localStorage.setItem("gender", user.gender);
  if (Array.isArray(user.roles)) localStorage.setItem("roles", JSON.stringify(user.roles));
  if (Array.isArray(user.permissions)) localStorage.setItem("permissions", JSON.stringify(user.permissions));
  if (typeof user.role === "string" && user.role) localStorage.setItem("role", user.role);
  // The server flags only the system account; anyone else clears the flag.
  if (user.isSystem === true) localStorage.setItem("isSystem", "1");
  else localStorage.removeItem("isSystem");
};

// Hides UI only (e.g. which roles to offer); the server checks every request.
export const isStoredSystem = () => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("isSystem") === "1";
};

// The signed-in user's own role (normalised), or null.
export const getStoredRole = () => {
  if (typeof window === "undefined") return null;
  return resolveRole({ role: localStorage.getItem("role"), roles: getStoredRoles() });
};

// Leaf keys the server granted. Sessions saved before permissions existed have
// none, so they see nothing restricted until the next /auth/me refresh.
export const getStoredPermissions = () => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem("permissions") || "[]");
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
};

// Hides UI only; the server checks every request. A module key needs all its leaves.
export const canStored = (key) => hasPermission(getStoredPermissions(), key);

export const getStoredRoles = () => {
  if (typeof window === "undefined") return [];
  return normalizeRoles(localStorage.getItem("roles") || localStorage.getItem("role"));
};

export const hasStoredRole = (...allowedRoles) => {
  const roles = getStoredRoles();
  return allowedRoles.some((role) => roles.includes(role));
};

export const isStoredAdmin = () => hasStoredRole(...ADMIN_ROLES);

export const getStoredUserId = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("user_id") || "";
};

export const getStoredUserTz = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("user_tz") || "";
};
// The signed-in viewer, shaped for canManageTargetClient (utils/roles.js).
export const getStoredViewer = () => ({
  id: getStoredUserId(),
  tz: getStoredUserTz(),
  role: getStoredRole(),
  isSystem: isStoredSystem(),
});

// Chooses which guide character walks the user through the app.
export const getStoredGender = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("gender") || "";
};
