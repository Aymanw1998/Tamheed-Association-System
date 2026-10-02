// Pure rules for the vehicles & trailers section: plates, date-only handling,
// insurance/licence/test status, alerts and input validation. Nothing here
// touches the database, so the logic is testable on its own.
//
// Dates are stored as "YYYY-MM-DD" text (a date on a document has no time or
// timezone), and "today" is always the calendar date in Asia/Jerusalem, so a
// document never shifts a day because of UTC.

const TIME_ZONE = "Asia/Jerusalem";

const VEHICLE_TYPES = ["vehicle", "trailer"];
const VEHICLE_STATUSES = ["active", "out_of_service", "archived"];
const BRAKE_VALUES = ["yes", "no", "unknown"];
const FEE_STATUSES = ["unknown", "unpaid", "paid", "exempt"];
const TEST_RESULTS = ["not_done", "passed", "failed", "exempt"];
const POLICY_TYPES = ["mandatory", "third_party", "comprehensive", "other"];
const DOCUMENT_KINDS = ["license", "policy", "test", "receipt", "other"];

// Alert lead times in days. The app has no settings store yet, so these are a
// constant; every function that uses them also accepts an override.
const DEFAULT_ALERT_DAYS = [30, 14, 7];

const PERMISSIONS = ["view", "edit", "compliance", "documents", "archive"];

const ADMIN_ROLE_NAMES = new Set(["ادارة", "إدارة", "الادارة", "الإدارة"]);

// ---------------------------------------------------------------- permissions

const isAdminUser = (user = {}) =>
  (Array.isArray(user.roles) ? user.roles : []).some((role) =>
    ADMIN_ROLE_NAMES.has(String(role).trim())
  );

// Administrators hold every vehicle permission. Everyone else needs each one
// granted explicitly, and nothing works without "view": you cannot change what
// you are not allowed to see.
function hasVehiclePermission(user = {}, permission) {
  if (!PERMISSIONS.includes(permission)) return false;
  if (isAdminUser(user)) return true;
  const granted = Array.isArray(user.vehiclePermissions) ? user.vehiclePermissions : [];
  return granted.includes("view") && granted.includes(permission);
}

function sanitizeVehiclePermissions(value) {
  if (!Array.isArray(value)) return [];
  return PERMISSIONS.filter((permission) => value.includes(permission));
}

// ---------------------------------------------------------------------- plate

// "12-345-67", "12 345 67" and "1234567" are the same plate. Kept as text so
// leading zeros survive.
function normalizePlate(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[\s\-.‎‏]/g, "");
}

function validatePlate(value) {
  const plate = normalizePlate(value);
  if (!plate) return "رقم اللوحة مطلوب";
  if (!/^[A-Z0-9]{5,10}$/.test(plate)) return "رقم اللوحة يجب أن يتكون من 5 إلى 10 أحرف أو أرقام";
  return "";
}

// ---------------------------------------------------------------------- dates

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDateOnly(value) {
  if (typeof value !== "string") return false;
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900 || year > 2200) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function todayInJerusalem(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function toUtcDay(dateOnly) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

// Whole days from `from` to `to` (negative when `to` is earlier).
function daysBetween(from, to) {
  return toUtcDay(to) - toUtcDay(from);
}

// ------------------------------------------------------------- expiry levels

// A document is valid through its end date, so it is expired only after it.
// Missing or malformed dates are "unknown", never "ok".
function expiryStatus(dueDate, today, alertDays = DEFAULT_ALERT_DAYS) {
  if (!isValidDateOnly(dueDate)) return { state: "unknown", daysLeft: null, bucket: null };
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft < 0) return { state: "expired", daysLeft, bucket: null };
  const sorted = [...alertDays].sort((a, b) => a - b);
  const bucket = sorted.find((limit) => daysLeft <= limit) ?? null;
  return { state: bucket === null ? "ok" : "due", daysLeft, bucket };
}

// ------------------------------------------------------------------ insurance

// Status follows the recorded data only. A cancelled policy is never active
// whatever its dates say, and a future policy is not active before it starts.
function policyStatus(policy = {}, today) {
  if (policy.cancelledAt) return "cancelled";
  if (!isValidDateOnly(policy.startDate) || !isValidDateOnly(policy.endDate)) return "incomplete";
  if (policy.endDate < policy.startDate) return "incomplete";
  if (today < policy.startDate) return "future";
  if (today > policy.endDate) return "expired";
  return "active";
}

// Overall cover for one vehicle, from its own policies only. A trailer is never
// assumed to be covered by the towing vehicle's policy.
function insuranceSummary(policies = [], today) {
  const list = Array.isArray(policies) ? policies : [];
  const withStatus = list.map((policy) => ({ policy, status: policyStatus(policy, today) }));
  const active = withStatus.filter((item) => item.status === "active");
  if (active.length) {
    const latest = active.reduce((best, item) =>
      item.policy.endDate > best.policy.endDate ? item : best
    );
    return { status: "active", policy: latest.policy, endDate: latest.policy.endDate };
  }
  const has = (status) => withStatus.some((item) => item.status === status);
  if (has("future")) return { status: "future", policy: null, endDate: null };
  if (has("incomplete")) return { status: "incomplete", policy: null, endDate: null };
  if (has("expired")) return { status: "expired", policy: null, endDate: null };
  if (has("cancelled")) return { status: "cancelled", policy: null, endDate: null };
  return { status: "none", policy: null, endDate: null };
}

// -------------------------------------------------------------- licence/test

// The current licence is the record valid the furthest ahead; fee status plays
// no part in validity.
function currentLicense(licenses = []) {
  const dated = (Array.isArray(licenses) ? licenses : []).filter(
    (record) => !record.voidedAt && isValidDateOnly(record.validUntil)
  );
  if (!dated.length) return null;
  return dated.reduce((best, record) => (record.validUntil > best.validUntil ? record : best));
}

// The official next test date is whatever the documents say. If the latest test
// failed and a retest date was recorded, that retest is what is due.
function effectiveTestDue(vehicle = {}) {
  const tests = (Array.isArray(vehicle.tests) ? vehicle.tests : []).filter((t) => !t.voidedAt);
  const latest = tests.length
    ? tests.reduce((best, test) => {
        const key = `${test.testDate || ""}|${test.recordedAt || ""}`;
        const bestKey = `${best.testDate || ""}|${best.recordedAt || ""}`;
        return key > bestKey ? test : best;
      })
    : null;
  if (latest && latest.result === "failed" && isValidDateOnly(latest.retestDate)) {
    return { dueDate: latest.retestDate, source: "retest" };
  }
  return { dueDate: vehicle.nextTestDate || "", source: "official" };
}

// Everything the list page shows, derived in one place so the table, the
// filters and the alerts can never disagree.
function summarizeVehicle(vehicle = {}, today, alertDays = DEFAULT_ALERT_DAYS) {
  const license = currentLicense(vehicle.licenses);
  const test = effectiveTestDue(vehicle);
  const insurance = insuranceSummary(vehicle.policies, today);
  return {
    license: {
      validUntil: license?.validUntil || "",
      ...expiryStatus(license?.validUntil, today, alertDays),
    },
    test: {
      dueDate: test.dueDate,
      source: test.source,
      ...expiryStatus(test.dueDate, today, alertDays),
    },
    insurance: {
      status: insurance.status,
      endDate: insurance.endDate || "",
      ...(insurance.status === "active"
        ? expiryStatus(insurance.endDate, today, alertDays)
        : { state: insurance.status === "expired" ? "expired" : "unknown", daysLeft: null, bucket: null }),
    },
  };
}

// ---------------------------------------------------------------------- alerts

// Alerts are derived from the data on every request. Renewing a document moves
// its due date, so the old alert disappears by itself, and one alert exists per
// (vehicle, kind, due date, level), so nothing repeats.
function buildAlerts(vehicle = {}, today, alertDays = DEFAULT_ALERT_DAYS) {
  if (vehicle.status === "archived") return [];
  const summary = summarizeVehicle(vehicle, today, alertDays);
  const base = {
    vehicleId: String(vehicle._id || ""),
    plate: vehicle.plate || "",
    nickname: vehicle.nickname || "",
    responsibleId: vehicle.responsibleId ? String(vehicle.responsibleId) : "",
  };
  const alerts = [];

  const push = (kind, dueDate, status, extra = {}) => {
    const level =
      status.state === "expired" ? "expired" : status.state === "due" ? `due${status.bucket}` : "missing";
    if (status.state === "ok") return;
    alerts.push({
      ...base,
      kind,
      level,
      dueDate: dueDate || "",
      daysLeft: status.daysLeft,
      key: `${base.vehicleId}:${kind}:${level}:${dueDate || "none"}`,
      ...extra,
    });
  };

  push("license", summary.license.validUntil, summary.license);
  push("test", summary.test.dueDate, summary.test, { source: summary.test.source });
  if (summary.insurance.status === "active") {
    push("insurance", summary.insurance.endDate, summary.insurance);
  } else if (summary.insurance.status === "expired") {
    push("insurance", "", { state: "expired", daysLeft: null });
  } else {
    push("insurance", "", { state: "unknown", daysLeft: null });
  }
  return alerts;
}

// Administrators see every alert; the person assigned to a vehicle sees only
// the alerts for it.
function filterAlertsForUser(alerts = [], user = {}) {
  if (isAdminUser(user)) return alerts;
  const userId = String(user.id || user._id || "");
  if (!userId) return [];
  return alerts.filter((alert) => alert.responsibleId && alert.responsibleId === userId);
}

// ------------------------------------------------------------------ validation

const isBlank = (value) => value === undefined || value === null || value === "";
const toNumber = (value) => (typeof value === "number" ? value : Number(String(value).trim()));

function optionalDate(value, label, errors, field) {
  if (isBlank(value)) return;
  if (!isValidDateOnly(value)) errors[field] = `${label} غير صالح`;
}

function optionalNumber(value, label, errors, field, { max = 1e9 } = {}) {
  if (isBlank(value)) return;
  const number = toNumber(value);
  if (!Number.isFinite(number) || number < 0 || number > max) {
    errors[field] = `${label} يجب أن يكون رقمًا بين 0 و ${max}`;
  }
}

function validateVehicle(input = {}, { today = todayInJerusalem() } = {}) {
  const errors = {};
  const plateError = validatePlate(input.plate);
  if (plateError) errors.plate = plateError;
  if (!VEHICLE_TYPES.includes(input.type)) errors.type = "نوع غير صالح";
  if (!isBlank(input.status) && !VEHICLE_STATUSES.includes(input.status)) errors.status = "حالة غير صالحة";

  if (!isBlank(input.year)) {
    const year = toNumber(input.year);
    const maxYear = Number(today.slice(0, 4)) + 1;
    if (!Number.isInteger(year) || year < 1900 || year > maxYear) {
      errors.year = `سنة الصنع يجب أن تكون بين 1900 و ${maxYear}`;
    }
  }

  const trailer = input.trailer || {};
  optionalNumber(trailer.selfWeightKg, "الوزن الذاتي", errors, "trailer.selfWeightKg", { max: 100000 });
  optionalNumber(trailer.grossWeightKg, "الوزن الإجمالي", errors, "trailer.grossWeightKg", { max: 100000 });
  optionalNumber(trailer.payloadKg, "الحمولة", errors, "trailer.payloadKg", { max: 100000 });
  if (!isBlank(trailer.brakes) && !BRAKE_VALUES.includes(trailer.brakes)) {
    errors["trailer.brakes"] = "قيمة الفرامل غير صالحة";
  }
  if (
    !errors["trailer.selfWeightKg"] &&
    !errors["trailer.grossWeightKg"] &&
    !isBlank(trailer.selfWeightKg) &&
    !isBlank(trailer.grossWeightKg) &&
    toNumber(trailer.grossWeightKg) < toNumber(trailer.selfWeightKg)
  ) {
    errors["trailer.grossWeightKg"] = "الوزن الإجمالي لا يمكن أن يقل عن الوزن الذاتي";
  }
  return errors;
}

function validateLicense(input = {}) {
  const errors = {};
  if (!isValidDateOnly(input.validUntil)) errors.validUntil = "تاريخ انتهاء الرخصة مطلوب وصحيح";
  optionalDate(input.validFrom, "تاريخ بدء الصلاحية", errors, "validFrom");
  if (
    !errors.validUntil &&
    !errors.validFrom &&
    !isBlank(input.validFrom) &&
    input.validUntil < input.validFrom
  ) {
    errors.validUntil = "تاريخ الانتهاء قبل تاريخ البدء";
  }
  if (!isBlank(input.feeStatus) && !FEE_STATUSES.includes(input.feeStatus)) {
    errors.feeStatus = "حالة الدفع غير صالحة";
  }
  optionalDate(input.feePaidDate, "تاريخ الدفع", errors, "feePaidDate");
  optionalNumber(input.feeAmount, "المبلغ", errors, "feeAmount", { max: 10000000 });
  return errors;
}

function validateTest(input = {}) {
  const errors = {};
  if (!TEST_RESULTS.includes(input.result)) errors.result = "نتيجة الفحص غير صالحة";
  optionalDate(input.testDate, "تاريخ الفحص", errors, "testDate");
  optionalDate(input.retestDate, "موعد إعادة الفحص", errors, "retestDate");
  optionalDate(input.nextTestDate, "موعد الفحص القادم", errors, "nextTestDate");
  if (input.result === "exempt" && isBlank(String(input.exemptionReason || "").trim())) {
    errors.exemptionReason = "سبب الإعفاء مطلوب";
  }
  if ((input.result === "passed" || input.result === "failed") && isBlank(input.testDate)) {
    errors.testDate = "تاريخ الفحص مطلوب";
  }
  if (!errors.retestDate && !errors.testDate && !isBlank(input.retestDate) && !isBlank(input.testDate)
      && input.retestDate < input.testDate) {
    errors.retestDate = "موعد إعادة الفحص قبل تاريخ الفحص";
  }
  return errors;
}

function validatePolicy(input = {}) {
  const errors = {};
  if (!POLICY_TYPES.includes(input.type)) errors.type = "نوع التأمين غير صالح";
  if (isBlank(String(input.insurer || "").trim())) errors.insurer = "شركة التأمين مطلوبة";
  optionalDate(input.startDate, "بداية التغطية", errors, "startDate");
  optionalDate(input.endDate, "نهاية التغطية", errors, "endDate");
  if (
    !errors.startDate &&
    !errors.endDate &&
    !isBlank(input.startDate) &&
    !isBlank(input.endDate) &&
    input.endDate < input.startDate
  ) {
    errors.endDate = "نهاية التغطية قبل بدايتها";
  }
  optionalNumber(input.cost, "التكلفة", errors, "cost", { max: 10000000 });
  optionalNumber(input.deductible, "التحمل الذاتي", errors, "deductible", { max: 10000000 });
  if (!isBlank(input.minDriverAge)) {
    const age = toNumber(input.minDriverAge);
    if (!Number.isInteger(age) || age < 16 || age > 99) errors.minDriverAge = "الحد الأدنى للعمر بين 16 و 99";
  }
  return errors;
}

// Fields whose old and new value are worth recording when a vehicle is edited.
function diffFields(before = {}, after = {}, fields = []) {
  const changes = [];
  for (const field of fields) {
    const from = field.split(".").reduce((value, key) => value?.[key], before);
    const to = field.split(".").reduce((value, key) => value?.[key], after);
    if (JSON.stringify(from ?? "") !== JSON.stringify(to ?? "")) {
      changes.push({ field, from: from ?? "", to: to ?? "" });
    }
  }
  return changes;
}

module.exports = {
  TIME_ZONE,
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  BRAKE_VALUES,
  FEE_STATUSES,
  TEST_RESULTS,
  POLICY_TYPES,
  DOCUMENT_KINDS,
  DEFAULT_ALERT_DAYS,
  PERMISSIONS,
  isAdminUser,
  hasVehiclePermission,
  sanitizeVehiclePermissions,
  normalizePlate,
  validatePlate,
  isValidDateOnly,
  todayInJerusalem,
  daysBetween,
  expiryStatus,
  policyStatus,
  insuranceSummary,
  currentLicense,
  effectiveTestDue,
  summarizeVehicle,
  buildAlerts,
  filterAlertsForUser,
  validateVehicle,
  validateLicense,
  validateTest,
  validatePolicy,
  diffFields,
};
