// Reads an Israeli vehicle licence (רישיון רכב) or insurance policy from an
// image/PDF with Claude and returns a PROPOSAL. Nothing is saved here; every
// value is re-validated, and anything doubtful comes back null with a warning.
const Anthropic = require("@anthropic-ai/sdk");
const rules = require("../utils/vehicleRules");

const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 30 * 1000;

const nullable = (type) => ({ anyOf: [{ type }, { type: "null" }] });
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentType", "plate", "vehicle", "license", "policy", "notes"],
  properties: {
    documentType: { type: "string", enum: ["license", "policy", "unknown"] },
    plate: nullable("string"),
    vehicle: {
      type: "object", additionalProperties: false,
      required: ["make", "model", "year", "color", "chassisNumber"],
      properties: { make: nullable("string"), model: nullable("string"), year: nullable("integer"), color: nullable("string"), chassisNumber: nullable("string") },
    },
    license: {
      type: "object", additionalProperties: false,
      required: ["validFrom", "validUntil", "feeAmount"],
      properties: { validFrom: nullable("string"), validUntil: nullable("string"), feeAmount: nullable("number") },
    },
    policy: {
      type: "object", additionalProperties: false,
      required: ["insurer", "policyNumber", "type", "startDate", "endDate", "cost"],
      properties: {
        insurer: nullable("string"), policyNumber: nullable("string"),
        type: { anyOf: [{ type: "string", enum: ["mandatory", "third_party", "comprehensive", "other"] }, { type: "null" }] },
        startDate: nullable("string"), endDate: nullable("string"), cost: nullable("number"),
      },
    },
    notes: nullable("string"),
  },
};

const SYSTEM_PROMPT =
  "You read Israeli vehicle documents: vehicle licences (רישיון רכב) and insurance policies " +
  "(ביטוח חובה, צד ג', מקיף). Documents may be in Hebrew or Arabic. Return only what is printed " +
  "on the document. Dates must be YYYY-MM-DD (Israeli documents print DD/MM/YYYY). If a value is " +
  "missing, unclear or you are not sure, return null for it - never guess. Policy type: mandatory " +
  "(חובה), third_party (צד ג'), comprehensive (מקיף), other. Amounts are plain numbers in shekels.";

const text = (value, max = 120) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const amount = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

function sanitizeExtraction(raw = {}, { expectedPlate = "" } = {}) {
  const warnings = [];
  const date = (value, field) => {
    if (value === null || value === undefined || value === "") return null;
    if (rules.isValidDateOnly(value)) return value;
    warnings.push(`invalid_date:${field}`);
    return null;
  };

  let plate = raw.plate ? rules.normalizePlate(raw.plate) : null;
  if (plate && rules.validatePlate(plate)) {
    warnings.push("invalid_plate");
    plate = null;
  }
  if (plate && expectedPlate && plate !== rules.normalizePlate(expectedPlate)) warnings.push("plate_mismatch");

  const v = raw.vehicle || {};
  const year = Number.isInteger(v.year) && v.year >= 1950 && v.year <= 2100 ? v.year : null;
  const l = raw.license || {};
  const p = raw.policy || {};
  const license = { validFrom: date(l.validFrom, "license.validFrom"), validUntil: date(l.validUntil, "license.validUntil"), feeAmount: amount(l.feeAmount) };
  const policy = {
    insurer: text(p.insurer), policyNumber: text(p.policyNumber, 60),
    type: p.type ? (rules.POLICY_TYPES.includes(p.type) ? p.type : "other") : null,
    startDate: date(p.startDate, "policy.startDate"), endDate: date(p.endDate, "policy.endDate"), cost: amount(p.cost),
  };
  if (license.validFrom && license.validUntil && license.validUntil < license.validFrom) warnings.push("dates_reversed:license");
  if (policy.startDate && policy.endDate && policy.endDate < policy.startDate) warnings.push("dates_reversed:policy");

  return {
    documentType: ["license", "policy"].includes(raw.documentType) ? raw.documentType : "unknown",
    proposed: {
      plate,
      vehicle: { make: text(v.make, 60), model: text(v.model, 60), year, color: text(v.color, 40), chassisNumber: text(v.chassisNumber, 40) },
      license,
      policy,
    },
    warnings,
  };
}

function contentBlock(buffer, mime) {
  const data = buffer.toString("base64");
  return mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mime, data } };
}

let sharedClient = null;
function defaultClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!sharedClient) sharedClient = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return sharedClient;
}

async function extractVehicleDocument({ buffer, mime, expected = "any", expectedPlate = "", client } = {}) {
  const anthropic = client || defaultClient();
  if (!anthropic) return { available: false, reason: "not_configured" };
  const hint = expected === "license" ? "The user expects a vehicle licence." : expected === "policy" ? "The user expects an insurance policy." : "";
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      messages: [{ role: "user", content: [contentBlock(buffer, mime), { type: "text", text: `Extract the fields. ${hint}`.trim() }] }],
    });
    if (response.stop_reason === "refusal") return { available: false, reason: "refused" };
    if (response.stop_reason === "max_tokens") return { available: false, reason: "unreadable" };
    const body = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    let raw;
    try {
      raw = JSON.parse(body);
    } catch {
      return { available: false, reason: "unreadable" };
    }
    return { available: true, ...sanitizeExtraction(raw, { expectedPlate }), source: { model: response.model || MODEL, extractedAt: new Date().toISOString() } };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { available: false, reason: "rate_limited" };
    if (err instanceof Anthropic.AuthenticationError) console.error("[vehicleDocExtract] invalid ANTHROPIC_API_KEY");
    else console.error("[vehicleDocExtract]", err?.status || "", err?.message || err);
    return { available: false, reason: "failed" };
  }
}

module.exports = { EXTRACTION_SCHEMA, sanitizeExtraction, extractVehicleDocument, MODEL };
