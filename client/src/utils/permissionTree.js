// Pure helpers for the permissions tab. A state is { defaults, grants, revokes }:
// defaults are the role's leaf keys; grants/revokes may hold leaf or module
// keys (the server expands module keys). effective = (defaults + grants) - revokes.
import { PERMISSION_TREE, ALL_KEYS } from "./permissionKeys";

// Reserved modules are not shown until they are built.
export const HIDDEN_MODULES = ["sports", "finance"];

export const visibleModules = () => Object.keys(PERMISSION_TREE).filter((m) => !HIDDEN_MODULES.includes(m));

export const leavesOf = (module) => (PERMISSION_TREE[module] || []).map((leaf) => `${module}.${leaf}`);

const moduleOf = (key) => String(key).split(".")[0];
const list = (value) => (Array.isArray(value) ? value : []);
const inTreeOrder = (keys) => ALL_KEYS.filter((key) => keys.has(key));

// Leaf keys in tree order; a module key becomes all of its leaves.
export const expandKeys = (keys) => {
  const out = new Set();
  for (const raw of list(keys)) {
    const key = String(raw || "").trim();
    if (Object.hasOwn(PERMISSION_TREE, key)) leavesOf(key).forEach((leaf) => out.add(leaf));
    else if (ALL_KEYS.includes(key)) out.add(key);
  }
  return inTreeOrder(out);
};

export const effectiveOf = ({ defaults, grants, revokes } = {}) => {
  const set = new Set([...expandKeys(defaults), ...expandKeys(grants)]);
  for (const key of expandKeys(revokes)) set.delete(key);
  return inTreeOrder(set);
};

export const moduleState = (module, effective) => {
  const held = new Set(list(effective));
  const leaves = leavesOf(module);
  const count = leaves.filter((leaf) => held.has(leaf)).length;
  if (leaves.length > 0 && count === leaves.length) return "all";
  return count > 0 ? "some" : "none";
};

export const sourceOf = (key, { defaults, grants, revokes } = {}) => {
  if (expandKeys(revokes).includes(key)) return "revoked";
  if (expandKeys(defaults).includes(key)) return "role";
  if (expandKeys(grants).includes(key)) return "granted";
  return "none";
};

// A module switch works only when the manager may grant every leaf of it
// (the server checks a module key leaf by leaf).
export const isModuleGrantable = (module, grantable) => {
  const allowed = new Set(list(grantable));
  return leavesOf(module).every((leaf) => allowed.has(leaf));
};

// When the user's grants or revokes hold the bare module key, changing any
// leaf removes that key, which the server checks leaf by leaf: so the leaves
// are editable only if the viewer may grant the whole module.
export const isLeafEditable = (module, { grants, revokes } = {}, grantable) => {
  const hasModuleKey = list(grants).includes(module) || list(revokes).includes(module);
  return !hasModuleKey || isModuleGrantable(module, grantable);
};

// "Reset to role" removes every grant and revoke; each must be grantable.
export const isResettable = ({ grants, revokes } = {}, grantable) => {
  const allowed = new Set(list(grantable));
  return expandKeys([...list(grants), ...list(revokes)]).every((key) => allowed.has(key));
};

// Replaces a module key of `module` with the leaves that still mean something.
const splitModule = (keys, module, keep) => list(keys).flatMap((key) =>
  key === module ? leavesOf(module).filter(keep) : [key]);

// A module key splits into the leaves it still affects: a revoke matters for
// a default or granted leaf; a grant for a non-default leaf not revoked.
export const toggleKey = (state, key, on) => {
  const defaults = new Set(expandKeys(state?.defaults));
  const granted = new Set(expandKeys(state?.grants));
  const revoked = new Set(expandKeys(state?.revokes));
  const module = moduleOf(key);
  let grants = splitModule(state?.grants, module, (leaf) => !defaults.has(leaf) && !revoked.has(leaf));
  let revokes = splitModule(state?.revokes, module, (leaf) => defaults.has(leaf) || granted.has(leaf));
  grants = grants.filter((k) => k !== key);
  revokes = revokes.filter((k) => k !== key);
  if (on && !defaults.has(key)) grants.push(key);
  if (!on && defaults.has(key)) revokes.push(key);
  return { grants, revokes };
};

export const toggleModule = (state, module, on) => {
  const defaults = new Set(expandKeys(state?.defaults));
  const ofModule = (key) => key === module || moduleOf(key) === module;
  const grants = list(state?.grants).filter((key) => !ofModule(key));
  const revokes = list(state?.revokes).filter((key) => !ofModule(key));
  // Off: a module revoke is needed only to hide role defaults.
  if (!on) {
    const hasDefault = leavesOf(module).some((leaf) => defaults.has(leaf));
    return { grants, revokes: hasDefault ? [...revokes, module] : revokes };
  }
  const missing = leavesOf(module).filter((leaf) => !defaults.has(leaf));
  if (missing.length === leavesOf(module).length) grants.push(module);
  else grants.push(...missing);
  return { grants, revokes };
};

export const diffSummary = (before, after) => {
  const was = new Set(expandKeys(before));
  const now = new Set(expandKeys(after));
  return {
    added: ALL_KEYS.filter((key) => now.has(key) && !was.has(key)),
    removed: ALL_KEYS.filter((key) => was.has(key) && !now.has(key)),
  };
};
