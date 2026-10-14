// Turns a server extraction PROPOSAL into values for one vehicle form. Values
// become strings (form inputs hold text); empty/null values are dropped, and a
// field the user already filled is never replaced.

const FIELDS = {
  license: { source: "license", keys: ["validFrom", "validUntil", "feeAmount"] },
  policy: { source: "policy", keys: ["insurer", "policyNumber", "type", "startDate", "endDate", "cost"] },
  vehicle: { source: "vehicle", keys: ["make", "model", "year", "color", "chassisNumber"] },
};

export function scanToDraft(target, proposed = {}) {
  const config = FIELDS[target];
  if (!config) return {};
  const source = proposed[config.source] || {};
  const out = {};
  if (target === "vehicle" && proposed.plate) out.plate = String(proposed.plate);
  for (const key of config.keys) {
    const value = source[key];
    if (value !== null && value !== undefined && value !== "") out[key] = String(value);
  }
  return out;
}

export function mergeScan(draft = {}, patch = {}) {
  const next = { ...draft };
  const filled = [];
  const skipped = [];
  for (const [key, value] of Object.entries(patch)) {
    if (next[key] !== undefined && next[key] !== null && String(next[key]).trim() !== "") skipped.push(key);
    else {
      next[key] = value;
      filled.push(key);
    }
  }
  return { draft: next, filled, skipped };
}
