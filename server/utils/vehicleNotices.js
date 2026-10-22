// Pure rules that turn vehicle alerts (vehicleRules.buildAlerts) into notices
// for the administrators' board: one notice per stage, a weekly reminder once
// a document has expired, and the nightly digest email. No database here.

const SEVERITY_BY_LEVEL = {
  due60: "info",
  due30: "important",
  due14: "important",
  missing: "important",
  due7: "critical",
  due0: "critical",
  expired: "critical",
};
const SEVERITY_ORDER = { critical: 0, important: 1, info: 2 };

const KIND_LABEL = { license: "الرخصة", test: "الفحص الدوري", insurance: "التأمين" };

const noticeSeverity = (level) => SEVERITY_BY_LEVEL[level] || "info";

// Stages repeat never; an expired document gets one key per 7 days since it
// expired. A renewal moves dueDate, which changes every key.
function dedupKeyFor(alert = {}) {
  const base = `vehicle:${alert.vehicleId}:${alert.kind}:${alert.level}:${alert.dueDate || "none"}`;
  if (alert.level !== "expired") return base;
  const daysExpired = Math.max(1, -Number(alert.daysLeft || 0));
  return `${base}:w${Math.floor(daysExpired / 7)}`;
}

function describeLevel(alert) {
  if (alert.level === "missing") return "غير مسجّل في النظام";
  if (alert.level === "expired") {
    const days = -Number(alert.daysLeft || 0);
    return days > 0 ? `منتهٍ منذ ${days} يومًا (${alert.dueDate})` : `منتهٍ (${alert.dueDate || "—"})`;
  }
  if (alert.level === "due0") return `ينتهي اليوم (${alert.dueDate})`;
  return `ينتهي خلال ${alert.daysLeft} يومًا (${alert.dueDate})`;
}

function shortLevel(alert) {
  if (alert.level === "expired") return "منتهٍ";
  if (alert.level === "due0") return "ينتهي اليوم";
  if (alert.level === "missing") return "غير مسجّل";
  return `خلال ${alert.daysLeft} يومًا`;
}

function noticeFromAlert(alert) {
  const vehicleName = [alert.plate, alert.nickname].filter(Boolean).join(" — ");
  const kind = KIND_LABEL[alert.kind] || alert.kind;
  return {
    title: `${kind}: ${vehicleName} — ${shortLevel(alert)}`.slice(0, 120),
    body: `${kind} للمركبة ${vehicleName} ${describeLevel(alert)}.`,
    category: "vehicle",
    severity: noticeSeverity(alert.level),
    link: `/vehicles/${alert.vehicleId}`,
    dedupKey: dedupKeyFor(alert),
  };
}

function planVehicleNotices(alerts = [], existingKeys = new Set()) {
  return alerts
    .map(noticeFromAlert)
    .filter((notice) => !existingKeys.has(notice.dedupKey))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function buildDigest(notices = []) {
  const subject = `تمهيد: تنبيهات جديدة للمركبات (${notices.length})`;
  const text = notices.map((n) => `- ${n.body}`).join("\n");
  const rows = notices.map((n) => `<li>${escapeHtml(n.body)}</li>`).join("");
  const html = `<div dir="rtl" style="font-family:Arial;line-height:1.6"><h2>${escapeHtml(subject)}</h2><ul>${rows}</ul><p>تجد التفاصيل في لوحة الإعلانات داخل النظام.</p></div>`;
  return { subject, html, text };
}

module.exports = { noticeSeverity, dedupKeyFor, noticeFromAlert, planVehicleNotices, buildDigest };
