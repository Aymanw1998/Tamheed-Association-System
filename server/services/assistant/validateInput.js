// A small JSON-schema checker for tool inputs (the project has no zod/ajv).
// It understands the subset the tool schemas use: type (object, string,
// integer, number, boolean, array), enum, properties, required,
// additionalProperties: false, items, format: "date", and the constraints the
// API's strict mode does not accept (minLength, maxLength, minimum, maximum,
// pattern, minItems, maxItems). Those are checked here and removed from the
// definitions sent to the model (apiSchema).
const CLIENT_ONLY = ["minLength", "maxLength", "minimum", "maximum", "pattern", "minItems", "maxItems"];
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(value) {
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Returns null when `value` fits `schema`, otherwise a short reason.
function check(schema, value, path = "input") {
  switch (schema.type) {
    case "object": {
      if (!isPlainObject(value)) return `${path} must be an object`;
      const props = schema.properties || {};
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(props, key)) return `${path}.${key} is not allowed`;
      }
      for (const key of schema.required || []) {
        if (!Object.hasOwn(value, key)) return `${path}.${key} is required`;
      }
      for (const [key, sub] of Object.entries(props)) {
        if (!Object.hasOwn(value, key)) continue;
        const reason = check(sub, value[key], `${path}.${key}`);
        if (reason) return reason;
      }
      return null;
    }
    case "array": {
      if (!Array.isArray(value)) return `${path} must be an array`;
      if (schema.minItems != null && value.length < schema.minItems) return `${path} has too few items`;
      if (schema.maxItems != null && value.length > schema.maxItems) return `${path} has too many items`;
      for (let i = 0; i < value.length; i += 1) {
        const reason = check(schema.items || {}, value[i], `${path}[${i}]`);
        if (reason) return reason;
      }
      return null;
    }
    case "string": {
      if (typeof value !== "string") return `${path} must be a string`;
      if (schema.minLength != null && value.length < schema.minLength) return `${path} is too short`;
      if (schema.maxLength != null && value.length > schema.maxLength) return `${path} is too long`;
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${path} has a wrong format`;
      if (schema.format === "date" && !isRealDate(value)) return `${path} must be a date (YYYY-MM-DD)`;
      break;
    }
    case "integer":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return `${path} must be a number`;
      if (schema.type === "integer" && !Number.isInteger(value)) return `${path} must be an integer`;
      if (schema.minimum != null && value < schema.minimum) return `${path} is too small`;
      if (schema.maximum != null && value > schema.maximum) return `${path} is too large`;
      break;
    }
    case "boolean":
      if (typeof value !== "boolean") return `${path} must be true or false`;
      break;
    default:
      return `${path} has an unsupported schema`;
  }
  if (schema.enum && !schema.enum.includes(value)) return `${path} must be one of: ${schema.enum.join(", ")}`;
  return null;
}

// The schema as sent to the API: client-only constraints removed.
function apiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(apiSchema);
  if (!isPlainObject(schema)) return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (CLIENT_ONLY.includes(key)) continue;
    out[key] = key === "properties"
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, apiSchema(v)]))
      : apiSchema(value);
  }
  return out;
}

module.exports = { check, apiSchema, isRealDate, CLIENT_ONLY };
