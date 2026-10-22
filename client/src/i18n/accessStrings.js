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
    photo: "الصورة", parentLink: "رابط ولي الأمر", roster: "قائمة طلاب الدرس", copyMonth: "نسخ شهر",
    record: "تسجيل", editOwn: "تعديل ما كتبه", editAll: "تعديل الكل", exportPdf: "تصدير PDF",
    compliance: "الفحوصات والتأمين", documents: "المستندات", archive: "أرشفة",
    use: "استخدام", manageAll: "إدارة كل الملفات", post: "نشر", runCheck: "تشغيل الفحص",
    approve: "قبول", changeRole: "تغيير الدور", passwords: "كلمات المرور", unlock: "فك الحظر",
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
      state: { all: "مفتوح كله", some: "مفتوح جزئيًا", none: "مغلق" },
      notGrantable: "لا تملك هذه الصلاحية", readOnly: "لا يمكنك تعديل صلاحيات هذا المستخدم",
      openOps: "عرض العمليات", closeOps: "إخفاء العمليات",
      reset: "إرجاع إلى صلاحيات الدور", resetConfirm: "سيُمسح كل ما مُنح وسُحب، ويبقى المستخدم بصلاحيات دوره فقط. متابعة؟",
      save: "حفظ", saveTitle: "حفظ الصلاحيات", added: "أُضيف", removed: "سُحب",
      noChanges: "لا توجد تغييرات", saved: "تم حفظ الصلاحيات", loadFailed: "تعذّر تحميل الصلاحيات",
      mine: "صلاحياتي", mineEmpty: "لا توجد صلاحيات", mineHint: "للقراءة فقط. لتغييرها تواصل مع الإدارة.",
      roleSection: "الدور", saveRole: "حفظ الدور", roleSaved: "تم تغيير الدور", roleUnchanged: "لم يتغير الدور",
      demoteTitle: "تنزيل الدور",
      demoteWarning: "تنزيل الدور يمسح كل الصلاحيات الخاصة لهذا المستخدم: الممنوحة والمسحوبة. متابعة؟",
      addNowTitle: "إضافة صلاحيات", addNowMessage: "تم حفظ الدور. هل تريد إضافة صلاحيات خاصة الآن؟",
      addNow: "الآن", later: "لاحقًا", cancel: "إلغاء", confirm: "تأكيد",
      approveTitle: "قبول المستخدم", approveMessage: "اختر دور {name}:", approve: "قبول",
      noAssignable: "لا يوجد دور تستطيع منحه", approved: "تمت الموافقة على المستخدم",
      locked: "الحساب محظور", lockedSince: "محظور منذ {when}", unlock: "فك الحظر",
      unlockConfirm: "فك حظر الحساب؟", unlocked: "تم فك الحظر",
      errors: {
        FORBIDDEN: "لا تملك صلاحية لهذه العملية", NOT_GRANTABLE: "إحدى الصلاحيات ليست ضمن ما تستطيع منحه",
        SELF: "لا يمكنك تعديل صلاحياتك", UNKNOWN_KEY: "صلاحية غير معروفة",
        UNKNOWN_ROLE: "دور غير معروف", ROLE_REQUIRED: "اختر دورًا للمستخدم", generic: "فشلت العملية",
      },
      modules: modules.ar, leaves: leaves.ar,
    },
    audit: {
      navTitle: "سجل التغييرات", title: "سجل التغييرات", recent: "آخر التغييرات", openAll: "عرض السجل الكامل",
      filters: {
        from: "من تاريخ", to: "إلى تاريخ", module: "القسم", actor: "المنفّذ (رقم هوية)", action: "العملية",
        targetId: "معرّف الهدف", q: "بحث حر", all: "الكل", apply: "بحث", clear: "مسح",
      },
      cols: { at: "الوقت", actor: "المنفّذ", module: "القسم", action: "العملية", target: "الهدف", changes: "التغييرات" },
      actions: {
        create: "إنشاء", update: "تعديل", delete: "حذف", approve: "قبول", permission_change: "تغيير صلاحيات",
        role_change: "تغيير دور", unlock: "فك حظر", lock: "حظر", upload: "رفع", rename: "إعادة تسمية",
        share: "مشاركة", unshare: "إلغاء مشاركة", drive_connect: "ربط Drive",
        system_recovery: "استعادة حساب النظام",
      },
      field: "الحقل", before: "قبل", after: "بعد", fields: "{n} حقول",
      empty: "لا توجد سجلات", total: "المجموع: {n}", page: "صفحة {page} من {pages}",
      prev: "السابق", next: "التالي", badDate: "تاريخ غير صالح", loadFailed: "تعذّر تحميل السجل",
      system: "النظام",
    },
    systemRecovery: {
      button: "استعادة حساب النظام",
      confirm: "سيتم إرسال كلمة مرور مؤقتة إلى بريد حساب النظام فقط، وسيُطلب تغييرها عند الدخول. متابعة؟",
      sent: "تم إرسال كلمة مرور مؤقتة إلى بريد حساب النظام.",
      notEnough: "لا يمكن الاستعادة بعد: يجب أن تكون هناك 3 محاولات دخول فاشلة على الأقل لحساب النظام.",
      cooldown: "تمت استعادة الحساب قبل قليل. حاول مرة أخرى بعد 10 دقائق.",
      notConfigured: "بريد حساب النظام أو خادم البريد غير مُعدّ على الخادم. تواصل مع قسم تكنولوجيا المعلومات.",
      emailFailed: "تعذّر إرسال البريد، ولم يتغيّر شيء.",
      generic: "فشلت الاستعادة.",
    },
    passwordChange: {
      title: "يجب تغيير كلمة المرور",
      ownTitle: "تغيير كلمة المرور", current: "كلمة المرور الحالية",
      intro: "انتهت صلاحية كلمة مرور حساب النظام (30 يومًا) أو تم تعيين كلمة مرور مؤقتة. اختر كلمة مرور جديدة للمتابعة.",
      newPassword: "كلمة المرور الجديدة", confirm: "تأكيد كلمة المرور الجديدة",
      hint: "8 أحرف على الأقل، ومختلفة عن الحالية.",
      resetHint: "من 8 إلى 128 حرفًا.",
      submit: "تغيير كلمة المرور", back: "رجوع إلى تسجيل الدخول", success: "تم تغيير كلمة المرور",
      show: "إظهار كلمة المرور", hide: "إخفاء كلمة المرور",
      errors: {
        BAD_INPUT: "الرجاء ملء جميع الحقول.", PASSWORD_TOO_SHORT: "كلمة المرور الجديدة قصيرة جدًا (8 أحرف على الأقل).",
        PASSWORD_TOO_LONG: "كلمة المرور الجديدة طويلة جدًا (128 حرفًا على الأكثر).", PASSWORD_SAME: "كلمة المرور الجديدة يجب أن تختلف عن الحالية.",
        MISMATCH: "تأكيد كلمة المرور لا يطابق.", WRONG_PASSWORD: "كلمة المرور الحالية غير صحيحة.",
        EXPIRED: "انتهت مهلة التغيير. سجّل الدخول من جديد.", RATE_LIMITED: "محاولات كثيرة. حاول لاحقًا.",
        generic: "تعذّر تغيير كلمة المرور.",
      },
    },
  },
};

export const AUDIT_ACTIONS = Object.keys(accessStrings.ar.audit.actions);
export const AUDIT_MODULES = ["users", "students", "lessons", "attendance", "reports", "vehicles", "files", "notices"];
