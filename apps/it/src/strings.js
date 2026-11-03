// Arabic text of the IT site. The permission names are copied from the
// everyday app (apps/system/src/i18n/accessStrings.js).

export const GENERIC_ERROR = "حدث خطأ، حاول مرة أخرى.";
export const TOO_MANY = "محاولات كثيرة. حاول مرة أخرى بعد قليل.";

export const ROLES = ["ادارة", "مرشد", "مساعد"];
const ROLE_LABELS = { "ادارة": "الإدارة", "مرشد": "مرشد", "مساعد": "مساعد مرشد" };
export const roleLabel = (role) => ROLE_LABELS[role] || role || "بدون دور";

export const ROOMS = { active: "نشط", waiting: "بانتظار القبول", noActive: "غير نشط" };

export const fillText = (text, values) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

const modules = {
  dashboard: "لوحة التحكم", calendar: "التقويم", students: "الطلاب", lessons: "الدروس",
  attendance: "الحضور والغياب", reports: "التقارير", vehicles: "المركبات", files: "الملفات",
  notices: "الإعلانات", users: "المستخدمون", ai: "المساعد الذكي", permissions: "الصلاحيات",
  audit: "سجل التغييرات", sports: "الرياضة", systemRecovery: "استعادة حساب النظام", storage: "التخزين",
};

const leaves = {
  view: "عرض", viewAll: "عرض الكل", create: "إضافة", edit: "تعديل", delete: "حذف",
  photo: "الصورة", parentLink: "رابط تسجيل الأهل", roster: "قائمة طلاب الدرس", copyMonth: "نسخ شهر",
  record: "تسجيل", editOwn: "تعديل ما أنشأه", editAll: "تعديل الكل", exportPdf: "تصدير PDF",
  compliance: "الفحوصات والتأمين", documents: "المستندات", archive: "أرشفة",
  use: "استخدام", manageAll: "إدارة كل الملفات", post: "نشر", runCheck: "تشغيل الفحص",
  approve: "قبول", changeRole: "تغيير الدور", passwords: "عرض كلمات المرور", unlock: "رفع الحظر",
  resetPassword: "تعيين كلمة مرور جديدة", manage: "إدارة الصلاحيات", reset: "إعادة تعيين",
};

// Module-specific leaf names win over the shared ones.
const leavesByModule = { sports: { coach: "تدريب الفرق", manage: "إدارة الرياضة" }, storage: { drive: "حساب Google Drive" } };

export const moduleName = (module) => modules[module] || module;
export const leafName = (key) => {
  const [module, leaf] = String(key).split(".");
  return leavesByModule[module]?.[leaf] || leaves[leaf] || key;
};

export const perms = {
  title: "صلاحيات المستخدم", role: "الدور", noRole: "بدون دور",
  lastChange: "آخر تغيير للصلاحيات: {who}، {when}", neverChanged: "لم تتغير الصلاحيات بعد", system: "النظام",
  source: { role: "من الدور", granted: "ممنوح", revoked: "مسحوب" },
  state: { all: "مفتوح بالكامل", some: "مفتوح جزئيًا", none: "مغلق" },
  notGrantable: "لا تملك هذه الصلاحية", readOnly: "لا يمكنك تعديل صلاحيات هذا المستخدم",
  openOps: "عرض العمليات", closeOps: "إخفاء العمليات",
  reset: "إرجاع إلى صلاحيات الدور",
  resetConfirm: "ستُلغى كل الصلاحيات الممنوحة والمسحوبة، ويبقى للمستخدم صلاحيات دوره فقط. هل تريد المتابعة؟",
  save: "حفظ", saveTitle: "حفظ الصلاحيات", added: "أُضيف", removed: "سُحب",
  noChanges: "لا توجد تغييرات", saved: "تم حفظ الصلاحيات بنجاح", loadFailed: "تعذّر تحميل الصلاحيات",
  cancel: "إلغاء", confirm: "تأكيد",
  errors: {
    FORBIDDEN: "ليست لديك صلاحية لتنفيذ هذه العملية", NOT_GRANTABLE: "إحدى الصلاحيات ليست ضمن ما تستطيع منحه",
    SELF: "لا يمكنك تعديل صلاحياتك", UNKNOWN_KEY: "صلاحية غير معروفة", UNKNOWN_ROLE: "دور غير معروف",
  },
};

export const auditActions = {
  create: "إنشاء", update: "تعديل", delete: "حذف", approve: "قبول", permission_change: "تغيير صلاحيات",
  role_change: "تغيير دور", unlock: "رفع حظر", lock: "حظر", upload: "رفع", rename: "إعادة تسمية",
  share: "مشاركة", unshare: "إلغاء مشاركة", drive_connect: "ربط Drive", system_recovery: "استعادة حساب النظام",
  sign_in: "دخول", pass_to_it: "انتقال إلى موقع IT", pass_to_system: "انتقال إلى النظام",
};
export const auditModules = {
  users: "المستخدمون", students: "الطلاب", lessons: "الدروس", attendance: "الحضور", reports: "التقارير",
  vehicles: "المركبات", files: "الملفات", notices: "الإعلانات", it: "موقع IT", storage: "التخزين",
};
