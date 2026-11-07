// Canonical definitions are generated from shared/permissions.json.
import catalog from "../generated/permissions.json";

export const PERMISSION_TREE = catalog.tree;

export const ALL_KEYS = Object.entries(PERMISSION_TREE).flatMap(([module, leaves]) =>
  leaves.map((leaf) => `${module}.${leaf}`));

// What only the IT site does; no everyday permission set holds one.
export const IT_KEYS = new Set(catalog.itKeys);

// A leaf key needs that leaf; a module key needs every leaf of the module.
export const hasPermission = (permissions, key) => {
  if (!Array.isArray(permissions) || typeof key !== "string" || !key) return false;
  if (Object.hasOwn(PERMISSION_TREE, key)) {
    return PERMISSION_TREE[key].every((leaf) => permissions.includes(`${key}.${leaf}`));
  }
  return ALL_KEYS.includes(key) && permissions.includes(key);
};
