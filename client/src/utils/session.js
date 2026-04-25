export const ADMIN_ROLES = ["ادارة", "إدارة", "الادارة", "الإدارة"];

export const normalizeRoles = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (error) {
      return [value];
    }

    return [value];
  }

  return [];
};

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
