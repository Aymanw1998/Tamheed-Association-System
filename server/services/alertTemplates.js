// Short alert texts per type in Arabic, Hebrew and English (no LLM: fixed
// templates are fast and free). Each entry is { severity, ar, he, en } where
// the language entries take the alert's params. renderAlert(type, params)
// returns { ar, he, en }.

// Names and labels are clipped so a long value cannot make a long alert.
const clip = (value, max = 60) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const nameOf = (p) => clip(p.name) || "—";

const VEHICLE_KIND = {
  license: { ar: "الرخصة", he: "הרישיון", en: "Licence" },
  test: { ar: "الفحص الدوري", he: "הטסט", en: "Roadworthiness test" },
  insurance: { ar: "التأمين", he: "הביטוח", en: "Insurance" },
};

function vehicleState(p, lang) {
  const days = Number(p.daysLeft);
  if (p.level === "missing") return { ar: "غير مسجّل", he: "לא רשום", en: "not recorded" }[lang];
  if (p.level === "expired") return { ar: "منتهٍ", he: "פג תוקף", en: "expired" }[lang];
  if (p.level === "due0") return { ar: "ينتهي اليوم", he: "פג היום", en: "expires today" }[lang];
  return { ar: `ينتهي خلال ${days} يومًا`, he: `פג בעוד ${days} ימים`, en: `expires in ${days} days` }[lang];
}

function vehicleTemplate(kind) {
  const label = VEHICLE_KIND[kind];
  const vehicle = (p) => clip([p.plate, p.nickname].filter(Boolean).join(" — ")) || "—";
  return {
    severity: "important",
    ar: (p) => `${label.ar} للمركبة ${vehicle(p)}: ${vehicleState(p, "ar")}`,
    he: (p) => `${label.he} של הרכב ${vehicle(p)}: ${vehicleState(p, "he")}`,
    en: (p) => `${label.en} for vehicle ${vehicle(p)}: ${vehicleState(p, "en")}`,
  };
}

const CHANGE = {
  role: { ar: "الدور", he: "התפקיד", en: "role" },
  permissions: { ar: "الصلاحيات", he: "ההרשאות", en: "permissions" },
};
const changeOf = (p, lang) => (CHANGE[p.change] || CHANGE.permissions)[lang];

const ALERT_TEMPLATES = {
  parent_registration: {
    severity: "important",
    ar: (p) => `طلب تسجيل جديد من الأهل: ${nameOf(p)}`,
    he: (p) => `בקשת הרשמה חדשה מהורים: ${nameOf(p)}`,
    en: (p) => `New parent registration request: ${nameOf(p)}`,
  },
  user_waiting: {
    severity: "important",
    ar: (p) => `مستخدم جديد ينتظر الموافقة: ${nameOf(p)}`,
    he: (p) => `משתמש חדש ממתין לאישור: ${nameOf(p)}`,
    en: (p) => `New user waiting for approval: ${nameOf(p)}`,
  },
  account_locked: {
    severity: "critical",
    ar: (p) => `تم حظر حساب ${nameOf(p)} بعد محاولات دخول فاشلة`,
    he: (p) => `החשבון של ${nameOf(p)} ננעל אחרי ניסיונות כניסה כושלים`,
    en: (p) => `${nameOf(p)}'s account was locked after failed sign-ins`,
  },
  access_changed: {
    severity: "important",
    ar: (p) => (p.self ? `تم تغيير ${changeOf(p, "ar")} في حسابك` : `تم تغيير ${changeOf(p, "ar")} للمستخدم ${nameOf(p)}`),
    he: (p) => (p.self ? `${changeOf(p, "he")} בחשבון שלך שונו` : `${changeOf(p, "he")} של ${nameOf(p)} שונו`),
    en: (p) => (p.self ? `Your ${changeOf(p, "en")} changed` : `${nameOf(p)}'s ${changeOf(p, "en")} changed`),
  },
  system_login_failures: {
    severity: "critical",
    ar: (p) => `${Number(p.count) || 0} محاولات دخول فاشلة متتالية إلى حساب النظام`,
    he: (p) => `${Number(p.count) || 0} ניסיונות כניסה כושלים ברצף לחשבון המערכת`,
    en: (p) => `${Number(p.count) || 0} failed sign-ins in a row on the system account`,
  },
  lesson_no_attendance: {
    severity: "important",
    ar: (p) => `انتهى درس ${clip(p.lesson) || "—"} اليوم ولم يُسجَّل الحضور`,
    he: (p) => `השיעור ${clip(p.lesson) || "—"} הסתיים היום ללא רישום נוכחות`,
    en: (p) => `Lesson ${clip(p.lesson) || "—"} ended today with no attendance recorded`,
  },
  sport_lesson_no_attendance: {
    severity: "important",
    ar: (p) => `درس ${clip(p.lesson) || "—"} انتهى دون تسجيل حضور`,
    he: (p) => `שיעור הספורט ${clip(p.lesson) || "—"} הסתיים ללא רישום נוכחות`,
    en: (p) => `Sport lesson ${clip(p.lesson) || "—"} ended with no attendance recorded`,
  },
  absence_streak: {
    severity: "important",
    ar: (p) => `${nameOf(p)} غاب ${Number(p.count) || 3} مرات متتالية`,
    he: (p) => `${nameOf(p)} נעדר/ה ${Number(p.count) || 3} פעמים ברצף`,
    en: (p) => `${nameOf(p)} was absent ${Number(p.count) || 3} times in a row`,
  },
  report_missing: {
    severity: "info",
    ar: () => "كان لك درس اليوم ولم تكتب تقريرًا بعد",
    he: () => "היה לך שיעור היום ועדיין לא כתבת דוח",
    en: () => "You had a lesson today and have not written a report yet",
  },
  vehicle_license: vehicleTemplate("license"),
  vehicle_test: vehicleTemplate("test"),
  vehicle_insurance: vehicleTemplate("insurance"),
};

function renderAlert(type, params = {}) {
  const template = ALERT_TEMPLATES[type];
  if (!template) throw new Error(`Unknown alert type: ${type}`);
  return { ar: template.ar(params), he: template.he(params), en: template.en(params) };
}

const defaultSeverity = (type) => ALERT_TEMPLATES[type]?.severity || "info";

module.exports = { ALERT_TEMPLATES, renderAlert, defaultSeverity };
