// Pure helpers for showing audit-log rows.

const isEmpty = (value) => value === undefined || value === null || value === "";

export const formatValue = (value) => {
  if (isEmpty(value)) return "—";
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

// Lesson rosters hold student ids; show names when the viewer has them.
const ROSTER_FIELDS = new Set(["list_students"]);
const withNames = (value, names) =>
  Array.isArray(value) ? value.map((id) => names.get(String(id)) || String(id)) : value;

export const changeRows = (changes, { studentNames } = {}) => {
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes).map(([field, change]) => {
    const named = ROSTER_FIELDS.has(field) && studentNames instanceof Map;
    const before = named ? withNames(change?.before, studentNames) : change?.before;
    const after = named ? withNames(change?.after, studentNames) : change?.after;
    return { field, before: formatValue(before), after: formatValue(after) };
  });
};

// Query params for GET /api/audit: blank filters are left out.
export const auditQuery = (filters = {}, page = 1) => {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    const text = typeof value === "string" ? value.trim() : value;
    if (!isEmpty(text)) out[key] = text;
  }
  out.page = page;
  return out;
};
