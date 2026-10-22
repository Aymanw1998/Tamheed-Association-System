// Text for the lesson roster's hidden-student count, add-by-ID lookup and the
// responsible-guide field. Merged in I18nContext as `roster`.
// {n} is replaced with a number by the component.
export const rosterStrings = {
  ar: {
    others: "طلاب آخرون: {n}",
    lookupTitle: "إضافة طالب برقم الهوية",
    lookupPlaceholder: "رقم الهوية كاملاً (9 أرقام)",
    lookupHint: "لإضافة طالب لا تراه في القائمة، اكتب رقم هويته كاملاً.",
    lookupButton: "بحث",
    lookupInvalid: "رقم الهوية غير صالح",
    lookupNotFound: "لا يوجد طالب بهذا الرقم",
    lookupFailed: "تعذر البحث الآن",
    lookupAdd: "إضافة",
    alreadyIn: "هذا الطالب موجود في الدرس",
    pendingTitle: "سيُضافون عند الحفظ",
    pendingRemove: "إزالة",
    added: "أُضيف الطالب إلى الدرس",
    notAdded: "لم يُضف الطالب إلى الدرس. تأكد من رقم الهوية وحاول مرة أخرى.",
    someNotAdded: "لم تتم إضافة بعض الطلاب إلى الدرس.",
    teacherHint: "ستُسجَّل أنت مرشداً لهذا الدرس، فلا يمكنك إنشاء درس لا تشارك فيه.",
    responsibleGuide: "المرشد المسؤول",
    chooseInstructor: "بدون مرشد مسؤول",
    inactiveGuide: "(غير نشط)",
  },
};
