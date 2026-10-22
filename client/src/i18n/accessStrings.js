// Text for the permissions tab, role changes, approvals, unlock and the audit
// log. Merged in I18nContext as `perms` and `audit`.

const modules = {
  ar: {
    dashboard: "لوحة التحكم", calendar: "التقويم", students: "الطلاب", lessons: "الدروس",
    attendance: "الحضور والغياب", reports: "التقارير", vehicles: "المركبات", files: "الملفات",
    notices: "الإعلانات", users: "المستخدمون", ai: "المساعد الذكي", permissions: "الصلاحيات",
    audit: "سجل التغييرات", systemRecovery: "استعادة حساب النظام", storage: "التخزين",
  },
};

// Operation names, shared by every module that has them.
const leaves = {
  ar: {
    view: "عرض", viewAll: "عرض الكل", create: "إضافة", edit: "تعديل", delete: "حذف",
    photo: "الصورة", parentLink: "رابط تسجيل الأهل", roster: "قائمة طلاب الدرس", copyMonth: "نسخ شهر",
    record: "تسجيل", editOwn: "تعديل ما أنشأه", editAll: "تعديل الكل", exportPdf: "تصدير PDF",
    compliance: "الفحوصات والتأمين", documents: "المستندات", archive: "أرشفة",
    use: "استخدام", manageAll: "إدارة كل الملفات", post: "نشر", runCheck: "تشغيل الفحص",
    approve: "قبول", changeRole: "تغيير الدور", passwords: "كلمات المرور", unlock: "رفع الحظر",
    manage: "إدارة الصلاحيات", reset: "إعادة تعيين",
  },
};

export const accessStrings = {
  ar: {
    perms: {
      tab: "الصلاحيات", detailsTab: "البيانات", title: "صلاحيات المستخدم",
      role: "الدور", noRole: "بدون دور", system: "النظام",
      lastChange: "آخر تغيير للصلاحيات: {who}، {when}", neverChanged: "لم تتغير الصلاحيات بعد",
      source: { role: "من الدور", granted: "ممنوح", revoked: "مسحوب", none: "" },
      state: { all: "مفتوح بالكامل", some: "مفتوح جزئيًا", none: "مغلق" },
      notGrantable: "لا تملك هذه الصلاحية", readOnly: "لا يمكنك تعديل صلاحيات هذا المستخدم",
      openOps: "عرض العمليات", closeOps: "إخفاء العمليات",
      reset: "إرجاع إلى صلاحيات الدور", resetConfirm: "ستُلغى كل الصلاحيات الممنوحة والمسحوبة، ويبقى للمستخدم صلاحيات دوره فقط. هل تريد المتابعة؟",
      save: "حفظ", saveTitle: "حفظ الصلاحيات", added: "أُضيف", removed: "سُحب",
      noChanges: "لا توجد تغييرات", saved: "تم حفظ الصلاحيات بنجاح", loadFailed: "تعذّر تحميل الصلاحيات",
      mine: "صلاحياتي", mineEmpty: "لا توجد صلاحيات", mineHint: "للقراءة فقط. لتغييرها تواصل مع الإدارة.",
      roleSection: "الدور", saveRole: "حفظ الدور", roleSaved: "تم تغيير الدور بنجاح", roleUnchanged: "لم يتغير الدور",
      demoteTitle: "خفض الدور",
      demoteWarning: "خفض الدور يلغي كل الصلاحيات الخاصة بهذا المستخدم، الممنوحة منها والمسحوبة. هل تريد المتابعة؟",
      addNowTitle: "إضافة صلاحيات", addNowMessage: "تم حفظ الدور. هل تريد إضافة صلاحيات خاصة الآن؟",
      addNow: "الآن", later: "لاحقًا", cancel: "إلغاء", confirm: "تأكيد",
      approveTitle: "قبول المستخدم", approveMessage: "اختر دور المستخدم {name}:", approve: "قبول",
      noAssignable: "لا يوجد دور تستطيع منحه", approved: "تم قبول المستخدم بنجاح",
      locked: "الحساب محظور", lockedSince: "محظور منذ {when}", unlock: "رفع الحظر",
      unlockConfirm: "هل تريد رفع الحظر عن هذا الحساب؟", unlocked: "تم رفع الحظر عن الحساب",
      errors: {
        FORBIDDEN: "ليست لديك صلاحية لتنفيذ هذه العملية", NOT_GRANTABLE: "إحدى الصلاحيات ليست ضمن ما تستطيع منحه",
        SELF: "لا يمكنك تعديل صلاحياتك", UNKNOWN_KEY: "صلاحية غير معروفة",
        UNKNOWN_ROLE: "دور غير معروف", ROLE_REQUIRED: "اختر دورًا للمستخدم", generic: "تعذّر إتمام العملية",
      },
      modules: modules.ar, leaves: leaves.ar,
    },
    audit: {
      navTitle: "سجل التغييرات", title: "سجل التغييرات", recent: "آخر التغييرات", openAll: "عرض السجل الكامل",
      filters: {
        from: "من تاريخ", to: "إلى تاريخ", module: "القسم", actor: "المنفّذ (رقم الهوية)", action: "العملية",
        targetId: "معرّف العنصر", q: "بحث نصي", all: "الكل", apply: "بحث", clear: "مسح التصفية",
      },
      cols: { at: "الوقت", actor: "المنفّذ", module: "القسم", action: "العملية", target: "العنصر", changes: "التغييرات" },
      actions: {
        create: "إنشاء", update: "تعديل", delete: "حذف", approve: "قبول", permission_change: "تغيير صلاحيات",
        role_change: "تغيير دور", unlock: "رفع حظر", lock: "حظر", upload: "رفع", rename: "إعادة تسمية",
        share: "مشاركة", unshare: "إلغاء مشاركة", drive_connect: "ربط Drive",
        system_recovery: "استعادة حساب النظام",
      },
      field: "الحقل", before: "قبل", after: "بعد", fields: "عدد الحقول: {n}",
      empty: "لا توجد سجلات", total: "المجموع: {n}", page: "صفحة {page} من {pages}",
      prev: "السابق", next: "التالي", badDate: "تاريخ غير صالح", loadFailed: "تعذّر تحميل السجل",
      system: "النظام",
    },
    systemRecovery: {
      button: "استعادة حساب النظام",
      confirm: "ستُرسل كلمة مرور مؤقتة إلى بريد حساب النظام فقط، وسيُطلب تغييرها عند الدخول. هل تريد المتابعة؟",
      sent: "تم إرسال كلمة مرور مؤقتة إلى بريد حساب النظام.",
      notEnough: "لا يمكن الاستعادة بعد: يجب أن تكون هناك 3 محاولات دخول فاشلة على الأقل لحساب النظام.",
      cooldown: "تمت استعادة الحساب قبل قليل. حاول مرة أخرى بعد 10 دقائق.",
      notConfigured: "بريد حساب النظام أو خادم البريد غير مُهيّأ على الخادم. تواصل مع قسم تكنولوجيا المعلومات.",
      emailFailed: "تعذّر إرسال البريد، ولم يتغيّر شيء.",
      generic: "تعذّرت استعادة الحساب.",
    },
    passwordChange: {
      title: "يجب تغيير كلمة المرور",
      ownTitle: "تغيير كلمة المرور", current: "كلمة المرور الحالية",
      intro: "انتهت صلاحية كلمة مرور حساب النظام (30 يومًا) أو تم تعيين كلمة مرور مؤقتة. اختر كلمة مرور جديدة للمتابعة.",
      newPassword: "كلمة المرور الجديدة", confirm: "تأكيد كلمة المرور الجديدة",
      hint: "8 أحرف على الأقل، ومختلفة عن الحالية.",
      resetHint: "من 8 إلى 128 حرفًا.",
      submit: "تغيير كلمة المرور", back: "رجوع إلى تسجيل الدخول", success: "تم تغيير كلمة المرور بنجاح",
      show: "إظهار كلمة المرور", hide: "إخفاء كلمة المرور",
      errors: {
        BAD_INPUT: "يُرجى تعبئة جميع الحقول.", PASSWORD_TOO_SHORT: "كلمة المرور الجديدة قصيرة جدًا (8 أحرف على الأقل).",
        PASSWORD_TOO_LONG: "كلمة المرور الجديدة طويلة جدًا (128 حرفًا على الأكثر).", PASSWORD_SAME: "كلمة المرور الجديدة يجب أن تختلف عن الحالية.",
        MISMATCH: "كلمة المرور الجديدة وتأكيدها غير متطابقين.", WRONG_PASSWORD: "كلمة المرور الحالية غير صحيحة.",
        EXPIRED: "انتهت مهلة التغيير. سجّل الدخول من جديد.", RATE_LIMITED: "عدد المحاولات كبير. حاول مرة أخرى لاحقًا.",
        generic: "تعذّر تغيير كلمة المرور.",
      },
    },
  },
};

export const AUDIT_ACTIONS = Object.keys(accessStrings.ar.audit.actions);
export const AUDIT_MODULES = ["users", "students", "lessons", "attendance", "reports", "vehicles", "files", "notices"];
