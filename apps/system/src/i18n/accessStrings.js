// Text for the permissions tab, role changes, approvals, unlock and the audit
// log. Merged in I18nContext as `perms` and `audit`.

import catalog from "../generated/permissions.json";
const { modules, leaves, leavesByModule } = catalog.labels.ar;

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
      // Shown on the signed-in user's page when an admin changes their access.
      accessChanged: "عدّلت الإدارة صلاحياتك.",
      accessWaiting: "ستتحدّث الصفحة بعد أن تحفظ تعديلاتك أو تغادرها.",
      accessApplyNow: "حدّث الآن", accessClose: "إغلاق",
      modules, leaves,
      // Module-specific leaf names; they win over the shared `leaves`.
      leavesByModule,
    },
    passwordChange: {
      title: "يجب تغيير كلمة المرور",
      ownTitle: "تغيير كلمة المرور", current: "كلمة المرور الحالية",
      intro: "انتهت صلاحية كلمة مرور حساب النظام (30 يومًا) أو تم تعيين كلمة مرور مؤقتة. اختر كلمة مرور جديدة للمتابعة.",
      newPassword: "كلمة المرور الجديدة", confirm: "تأكيد كلمة المرور الجديدة",
      hint: "أي كلمة مرور تختارها.",
      resetHint: "أي كلمة مرور تختارها.",
      submit: "تغيير كلمة المرور", cancel: "إلغاء", back: "رجوع إلى تسجيل الدخول", success: "تم تغيير كلمة المرور بنجاح",
      show: "إظهار كلمة المرور", hide: "إخفاء كلمة المرور",
      errors: {
        BAD_INPUT: "يُرجى تعبئة جميع الحقول.", PASSWORD_REQUIRED: "يجب إدخال كلمة مرور جديدة.",
        PASSWORD_TOO_LONG: "كلمة المرور الجديدة طويلة جدًا (128 حرفًا على الأكثر).",
        MISMATCH: "كلمة المرور الجديدة وتأكيدها غير متطابقين.", WRONG_PASSWORD: "كلمة المرور الحالية غير صحيحة.",
        EXPIRED: "انتهت مهلة التغيير. سجّل الدخول من جديد.", RATE_LIMITED: "عدد المحاولات كبير. حاول مرة أخرى لاحقًا.",
        generic: "تعذّر تغيير كلمة المرور.",
      },
    },
  },
};
