const { actorLabel } = require("../middleware/permissionMiddleware");
const { logWithSource } = require("../middleware/logger");
const { isSystemTz } = require("./permissions");

const REDACTED = "***";
const IGNORED = new Set(["updatedAt", "updatedBy", "updatedByName"]);

// "otp" must start a word (resetOtpHash, otp) so names like rootPath stay visible.
const OTP_NAME = /^otp|Otp|OTP/;

function isSecret(field) {
  const name = String(field);
  return /password|token|secret|api_?key|hash$/i.test(name) || OTP_NAME.test(name);
}

const isPlain = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

// Copy of value with the value of any secret-named key (at any depth) replaced.
function redact(value, depth = 0) {
  if (depth > 20) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (!isPlain(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = isSecret(k) ? REDACTED : redact(v, depth + 1);
  return out;
}

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

// Shallow diff of two records; secrets keep their key but never their value.
function diffChanges(before, after) {
  const a = before && typeof before === "object" ? before : {};
  const b = after && typeof after === "object" ? after : {};
  const changes = {};
  for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (IGNORED.has(field) || same(a[field], b[field])) continue;
    changes[field] = isSecret(field)
      ? { before: REDACTED, after: REDACTED }
      : { before: redact(a[field]), after: redact(b[field]) };
  }
  return changes;
}

const SYSTEM_ID = "system";
const SYSTEM_LABEL = "النظام";

// The system account's TZ must never reach an audit row. Null when unset/blank.
function systemMasker() {
  const tz = String(process.env.SYSTEM_ADMIN_TZ || "").trim();
  if (!tz) return null;
  const escaped = tz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pathRe = new RegExp(`(^|/)users/${escaped}(?=/|$)`, "g");
  const maskString = (v) => (v.trim() === tz ? SYSTEM_ID : v.replace(pathRe, `$1users/${SYSTEM_ID}`));
  const mask = (value, depth = 0) => {
    if (typeof value === "string") return maskString(value);
    if (depth > 20) return value;
    if (Array.isArray(value)) return value.map((v) => mask(v, depth + 1));
    if (!isPlain(value)) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = mask(v, depth + 1);
    return out;
  };
  return { mask, maskString };
}

function createAudit({ model, now = () => new Date() }) {
  return {
    // Never throws: a failed audit write must not fail the action it describes.
    async record(req, { module, action, targetType, targetId, targetLabel, before, after } = {}) {
      try {
        let id = targetId === undefined || targetId === null ? targetId : String(targetId);
        let label = targetLabel;
        let changes = diffChanges(before, after);
        const masker = systemMasker();
        if (masker) {
          const docTz = (d) => (d && typeof d === "object" ? d.tz : undefined);
          const isSystemTarget =
            isSystemTz(id) || (targetType === "user" && (isSystemTz(docTz(before)) || isSystemTz(docTz(after))));
          if (isSystemTarget) {
            id = SYSTEM_ID;
            label = SYSTEM_LABEL;
          } else {
            if (typeof id === "string") id = masker.maskString(id);
            if (typeof label === "string") label = masker.maskString(label);
          }
          changes = masker.mask(changes);
        }
        await model.create({
          at: now(),
          ...actorLabel(req?.actor),
          module,
          action,
          targetType,
          targetId: id,
          targetLabel: label,
          changes,
          ip: req?.ip,
          // An action the user approved in the assistant (services/assistant/actionRunner.js).
          ...(req?.via === "assistant" ? { via: "assistant" } : {}),
        });
      } catch (error) {
        logWithSource("audit.record", error);
      }
    },
  };
}

// Loaded lazily so requiring this file does not pull in the database layer.
const audit = createAudit({
  model: {
    create: (data) => require("../Entities/Audit/Audit.model").AuditModelDef.create(data),
  },
});

module.exports = { diffChanges, createAudit, audit };
