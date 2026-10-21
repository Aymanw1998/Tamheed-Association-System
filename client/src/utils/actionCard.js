// Pure helpers for the assistant's approval cards (spec, part 2): the card's
// state machine, the mapping of server answers, and the display rows built
// from `details` (everything that will be written, shown in full as text).

export const ACTION_TYPES = Object.freeze(["attendance", "add_student_to_lesson", "report", "notice", "approve_user"]);
const TYPE_SET = new Set(ACTION_TYPES);

// Every reason text under assistant.chat.action.reasons (ar/he/en): refusals
// that use the action up, plus the retryable notices.
export const ACTION_REASONS = Object.freeze([
  "FORBIDDEN", "NOT_POSSIBLE", "FAILED", "NOT_FOUND", "ALREADY_USED", "BUSY", "NETWORK", "SESSION", "SERVER_ERROR",
]);
const REASON_SET = new Set(ACTION_REASONS);

const LANGS = ["ar", "he", "en"];
const lang = (language) => (LANGS.includes(language) ? language : "ar");
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value));

// ---------------------------------------------------------------- cards

// A card from an `action` event or from the conversation's pendingActions;
// null when it is not usable.
export const normalizeCard = (raw) => {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!TYPE_SET.has(raw.type)) return null;
  if (!isObject(raw.details)) return null;
  if (typeof raw.expiresAt !== "string" || Number.isNaN(new Date(raw.expiresAt).getTime())) return null;
  return {
    id: raw.id,
    type: raw.type,
    summary: isObject(raw.summary) ? raw.summary : {},
    details: raw.details,
    expiresAt: raw.expiresAt,
    ...(Array.isArray(raw.before) ? { before: raw.before } : {}),
  };
};

// Adds the usable cards that are not in the list yet (by id). The same list
// object comes back when nothing was added.
export const upsertCards = (list, incoming) => {
  const current = Array.isArray(list) ? list : [];
  const seen = new Set(current.map((card) => card.id));
  const added = [];
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const card = normalizeCard(raw);
    if (card && !seen.has(card.id)) {
      seen.add(card.id);
      added.push(card);
    }
  }
  return added.length ? [...current, ...added] : current;
};

// ---------------------------------------------------------------- state

// status: pending | approving | done | cancelled | refused | expired | handled
// (used already, outcome unknown here: "check the conversation").
// `notice` is a retryable problem (BUSY, NETWORK...); `reason` explains a refusal.
export const initialActionState = () => ({ status: "pending", action: "", reason: "", notice: "" });

const TERMINAL = new Set(["done", "cancelled", "refused", "expired", "handled"]);

export const effectiveStatus = (card, state, now = Date.now()) => {
  const status = state?.status || "pending";
  if (status === "pending" && new Date(card?.expiresAt).getTime() <= now) return "expired";
  return status;
};

export const disabledReason = (card, state, { streaming = false, now = Date.now() } = {}) => {
  const status = effectiveStatus(card, state, now);
  if (status === "expired") return "expired";
  if (TERMINAL.has(status)) return "used";
  if (status === "approving") return "approving";
  if (streaming) return "streaming";
  return "";
};

export const canAct = (card, state, options) => disabledReason(card, state, options) === "";

// The click: pending -> approving. Anything else returns the same state.
export const startAction = (state, action) =>
  state?.status === "pending" ? { ...state, status: "approving", action, notice: "" } : state;

export const applyOutcome = (state, outcome) => {
  const kind = outcome?.kind;
  if (kind === "done" || kind === "cancelled" || kind === "expired" || kind === "handled") return { ...state, status: kind, notice: "", reason: "" };
  if (kind === "refused") return { ...state, status: "refused", reason: outcome.reason || "FAILED", notice: "" };
  if (kind === "busy") return { ...state, status: "pending", notice: "BUSY" };
  return { ...state, status: "pending", notice: REASON_SET.has(outcome?.reason) ? outcome.reason : "SERVER_ERROR" };
};

// Approving a notice (broadcast) or a user (account) asks once more.
export const needsConfirm = (type) => type === "notice" || type === "approve_user";

// The server's answer to approve/cancel -> { kind, reason? }.
// kind: done | cancelled | refused (action used up) | expired | handled
// (used before, outcome unknown) | busy (can retry later) | retry (nothing
// reached the action, or we cannot tell: network, session, server error).
// A 409 ALREADY_USED carries the recorded outcome (body.status), so a retry
// after a lost answer shows what really happened.
const USED = { done: { kind: "done" }, cancelled: { kind: "cancelled" }, failed: { kind: "refused", reason: "ALREADY_USED" } };
export const outcomeOf = (action, status, body) => {
  const code = isObject(body) && typeof body.code === "string" ? body.code : "";
  if (status === 200 && isObject(body) && body.ok === true) return { kind: action === "cancel" ? "cancelled" : "done" };
  if (status === 0) return { kind: "retry", reason: "NETWORK" };
  if (status === 401 || status === 423) return { kind: "retry", reason: "SESSION" };
  if (status === 410 || code === "EXPIRED") return { kind: "expired" };
  if (code === "BUSY") return { kind: "busy" };
  if (status === 404) return { kind: "refused", reason: "NOT_FOUND" };
  if (status === 409) {
    const recorded = isObject(body) && typeof body.status === "string" ? body.status : "";
    const used = Object.prototype.hasOwnProperty.call(USED, recorded) ? USED[recorded] : null;
    return used ? { ...used } : { kind: "handled" };
  }
  if (status === 403) return { kind: "refused", reason: "FORBIDDEN" };
  if (status === 422) return { kind: "refused", reason: "NOT_POSSIBLE" };
  if (status === 500 && code === "FAILED") return { kind: "refused", reason: "FAILED" };
  return { kind: "retry", reason: "SERVER_ERROR" };
};

// ---------------------------------------------------------------- display

const STATUS = {
  "حاضر": { tone: "present", ar: "حاضر", he: "נוכח", en: "Present" },
  "غائب": { tone: "absent", ar: "غائب", he: "נעדר", en: "Absent" },
  "متأخر": { tone: "late", ar: "متأخر", he: "מאחר", en: "Late" },
};
const ROLE = {
  "ادارة": { ar: "ادارة", he: "ניהול", en: "Admin" },
  "مرشد": { ar: "مرشد", he: "מדריך", en: "Guide" },
  "مساعد": { ar: "مساعد", he: "עוזר", en: "Assistant" },
};
const SEVERITY = {
  critical: { ar: "عاجل", he: "דחוף", en: "Urgent" },
  important: { ar: "مهم", he: "חשוב", en: "Important" },
  info: { ar: "معلومة", he: "מידע", en: "Info" },
};
const own = (map, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);
const pick = (map, key, language) => (own(map, key) ? map[key][lang(language)] : text(key));

// What the card shows, from `details` only: { fields, rows }. Values are
// plain strings, rendered as React text (long text keeps its line breaks via
// CSS). Field labels are keys under assistant.chat.action.labels.
export const describeCard = (card, language) => {
  const d = isObject(card?.details) ? card.details : null;
  if (!d) return { fields: [], rows: [] };
  switch (card.type) {
    case "attendance": {
      const before = new Map((Array.isArray(card.before) ? card.before : []).map((row) => [text(row?.studentId), text(row?.status)]));
      const rows = (Array.isArray(d.rows) ? d.rows : []).map((row) => ({
        id: text(row?.studentId),
        name: text(row?.studentName),
        status: pick(STATUS, row?.status, language),
        tone: own(STATUS, row?.status) ? STATUS[row.status].tone : "",
        notes: text(row?.notes),
        before: before.has(text(row?.studentId)) ? pick(STATUS, before.get(text(row?.studentId)), language) : "",
      }));
      return { fields: [{ labelKey: "lesson", value: text(d.lessonName) }, { labelKey: "date", value: text(d.date) }], rows };
    }
    case "add_student_to_lesson": {
      const fields = [{ labelKey: "lesson", value: text(d.lessonName) }];
      if (d.studentName) fields.push({ labelKey: "student", value: text(d.studentName) });
      fields.push({ labelKey: "tz", value: text(d.tz) });
      return { fields, rows: [] };
    }
    case "report":
      return {
        fields: [
          { labelKey: "date", value: text(d.date) },
          { labelKey: "title", value: text(d.title) },
          { labelKey: "text", value: text(d.text), block: true },
        ],
        rows: [],
      };
    case "notice":
      return {
        fields: [
          { labelKey: "title", value: text(d.title) },
          { labelKey: "severity", value: pick(SEVERITY, d.severity, language) },
          { labelKey: "body", value: text(d.body), block: true },
        ],
        rows: [],
      };
    case "approve_user":
      return {
        fields: [
          { labelKey: "user", value: text(d.name) },
          { labelKey: "tz", value: text(d.tz) },
          { labelKey: "role", value: pick(ROLE, d.role, language) },
        ],
        rows: [],
      };
    default:
      return { fields: [], rows: [] };
  }
};

const LOCALES = { ar: "ar", he: "he", en: "en-GB" };

// "HH:mm" on the Asia/Jerusalem clock.
export const expiryTime = (value, language) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALES[language] || "ar", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  }).format(date);
};
