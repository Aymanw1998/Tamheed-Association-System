// Arabic permission labels share the System/server catalog.
import catalog from "./generated/permissions.json";

export const GENERIC_ERROR = "حدث خطأ، حاول مرة أخرى.";
export const TOO_MANY = "محاولات كثيرة. حاول مرة أخرى بعد قليل.";

export const ROLES = ["ادارة", "مرشد", "مساعد"];
const ROLE_LABELS = { "ادارة": "الإدارة", "مرشد": "مرشد", "مساعد": "مساعد مرشد" };
export const roleLabel = (role) => ROLE_LABELS[role] || role || "بدون دور";

export const ROOMS = { active: "نشط", waiting: "بانتظار القبول", noActive: "غير نشط" };

export const fillText = (text, values) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

const { modules, leaves, leavesByModule } = catalog.labels.ar;

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
  passkey_add: "حفظ دخول بالبصمة",
  admin_powers_change: "تغيير صلاحيات المديرين", request_alerts_change: "تغيير تنبيهات الطلبات",
  role_defaults_change: "تغيير صلاحيات دور", role_defaults_reset: "إرجاع صلاحيات دور إلى الأصل",
};
export const auditModules = {
  users: "المستخدمون", students: "الطلاب", lessons: "الدروس", attendance: "الحضور", reports: "التقارير",
  vehicles: "المركبات", files: "الملفات", notices: "الإعلانات", it: "موقع IT", storage: "التخزين",
  permissions: "الصلاحيات",
};

// «صلاحيات الأدوار»
export const roleDefaultsText = {
  title: "صلاحيات الأدوار",
  intro: "ما يحصل عليه كل دور تلقائيًا. التغيير يصل فورًا إلى كل مستخدمي الدور، وتبقى الصلاحيات الخاصة الممنوحة أو المسحوبة لكل مستخدم كما هي.",
  users: "{count} مستخدمين بهذا الدور",
  custom: "معدّلة", original: "الأصلية",
  lastChange: "آخر تغيير: {who}، {when}",
  save: "حفظ", reset: "الرجوع إلى الأصل",
  saveTitle: "حفظ صلاحيات الدور «{role}»",
  saveAffects: "يصل التغيير إلى {count} مستخدمين.",
  resetTitle: "الرجوع إلى الأصل",
  resetConfirm: "ستعود صلاحيات الدور «{role}» إلى الصلاحيات الأصلية، ويصل ذلك إلى {count} مستخدمين. هل تريد المتابعة؟",
  saved: "تم حفظ صلاحيات الدور", resetDone: "عادت صلاحيات الدور إلى الأصل",
  notAllowed: "لا يمكن أن تكون صلاحية تلقائية لدور",
  errors: {
    IT_KEY: "صلاحيات قسم IT لا تُعطى لأي دور تلقائيًا",
    GRANT_ONLY: "هذه الصلاحية تُمنح لشخص بعينه فقط، لا لدور",
    UNKNOWN_KEY: "صلاحية غير معروفة", UNKNOWN_ROLE: "دور غير معروف",
  },
};

// «مستخدم IT جديد»
export const newItUserText = {
  open: "مستخدم IT جديد",
  title: "إضافة مستخدم IT جديد",
  intro: "مستخدم جديد غير موجود في النظام، يكون من قسم IT منذ البداية. تصل إلى بريده كلمة مرور مؤقتة.",
  firstname: "الاسم الشخصي", lastname: "اسم العائلة", tz: "رقم الهوية", email: "البريد الإلكتروني",
  phone: "الهاتف", role: "الدور في النظام (اختياري)", noRole: "بدون دور",
  create: "إضافة", cancel: "إلغاء",
  created: "تمت إضافة المستخدم، وأُرسلت كلمة مرور مؤقتة إلى بريده",
  errors: {
    TZ_EXISTS: "يوجد مستخدم بهذا الرقم. لجعله من قسم IT يجب أن يضيفه حساب النظام.",
    INVALID_TZ: "رقم الهوية غير صالح",
    NO_REAL_EMAIL: "يجب إدخال بريد إلكتروني حقيقي، فإليه يصل رمز الدخول",
    NAME_REQUIRED: "الاسم الشخصي واسم العائلة مطلوبان",
    UNKNOWN_ROLE: "دور غير معروف",
  },
};

// Account state on the user page
export const accountText = {
  title: "حالة الحساب",
  disable: "تعطيل الحساب", enable: "تفعيل الحساب", approve: "قبول المستخدم", remove: "حذف المستخدم",
  disableConfirm: "لن يتمكن {name} من الدخول إلى النظام حتى يُفعَّل الحساب من جديد. هل تريد المتابعة؟",
  removeConfirm: "سيُحذف {name} نهائيًا ولا يمكن التراجع. هل تريد المتابعة؟",
  needRole: "اختر دورًا أولًا (في بطاقة «الدور»)",
  disabled: "تم تعطيل الحساب", enabled: "تم تفعيل الحساب", approved: "تم قبول المستخدم", removed: "تم حذف المستخدم",
  hint: { active: "الحساب نشط ويمكنه الدخول.", waiting: "الحساب بانتظار القبول.", noActive: "الحساب معطّل ولا يمكنه الدخول." },
};
