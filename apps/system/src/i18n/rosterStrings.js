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
    lookupFailed: "تعذّر البحث حاليًا",
    lookupAdd: "إضافة",
    alreadyIn: "هذا الطالب موجود في البرنامج",
    pendingTitle: "سيُضافون عند الحفظ",
    pendingRemove: "إزالة",
    added: "تمت إضافة الطالب إلى البرنامج",
    notAdded: "تعذّرت إضافة الطالب إلى البرنامج. تحقّق من رقم الهوية وحاول مرة أخرى.",
    someNotAdded: "تعذّرت إضافة بعض الطلاب إلى البرنامج.",
    teacherHint: "ستُسجَّل مرشدًا لهذا البرنامج، إذ لا يمكنك إنشاء برنامج لا تشارك فيه.",
    responsibleGuide: "المرشد المسؤول",
    chooseInstructor: "بدون مرشد مسؤول",
    inactiveGuide: "(غير نشط)",
    guideLoading: "جارٍ التحميل…",
    guideUnavailable: "(تعذّر تحميل اسم المرشد)",
  },
};
