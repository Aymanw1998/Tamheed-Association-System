// Text for the guided tours: popover buttons, the "?" help center, the new
// access prompt, "what's new" and the user page's tour status. Merged in I18nContext as `tour`.
// The tours' own steps (including the welcome intro) live in tours/registry.js.
// {name}, {current} and {total} are filled in by the code.

const names = {
  ar: {
    welcome: "الجولة العامة", dashboard: "لوحة التحكم", calendar: "التقويم", attendance: "الحضور والغياب",
    students: "الطلاب", student: "ملف الطالب", lessons: "الدروس", lesson: "تفاصيل الدرس",
    reports: "التقارير", report: "تفاصيل التقرير", vehicles: "المركبات", vehicle: "تفاصيل المركبة",
    files: "الملفات", notices: "الإعلانات", users: "المستخدمون", user: "صفحة المستخدم",
    audit: "سجل التغييرات", profile: "الملف الشخصي", assistant: "المساعد والتنبيهات",
  },
};

export const tourStrings = {
  ar: {
    next: "التالي",
    prev: "السابق",
    done: "إنهاء",
    later: "لاحقًا",
    skip: "تخطٍّ",
    progress: "{current} من {total}",
    names: names.ar,
    userStatus: {
      title: "الجولة التعريفية",
      welcome: "الجولة العامة:",
      status: { done: "أنهى الجولة", skipped: "تخطّى", none: "لم يرها بعد" },
      sections: "جولات الأقسام: {done} مكتملة، {skipped} متخطّاة",
      reset: "اعرضها مجددًا عند الدخول القادم",
      resetDone: "ستظهر الجولات لهذا المستخدم عند دخوله القادم.",
      resetFailed: "تعذّرت إعادة الجولات، حاول مرة أخرى.",
    },
    help: {
      button: "مركز المساعدة",
      title: "مركز المساعدة",
      intro: "أعد أي جولة تعريفية أو اطّلع على آخر التحديثات.",
      explainScreen: "شرح هذه الشاشة",
      noScreenTour: "لا توجد جولة لهذه الشاشة بعد.",
      generalTour: "الجولة العامة",
      whatsNew: "ما الجديد",
      toursTitle: "كل الجولات",
      start: "ابدأ",
      noTours: "لا توجد جولات متاحة حاليًا.",
      status: { done: "شاهدتها", skipped: "تخطّيتها", none: "لم تشاهدها بعد" },
      close: "إغلاق",
    },
    whatsNew: {
      title: "ما الجديد",
      empty: "لا توجد تحديثات حاليًا.",
      showMe: "أرني",
      newBadge: "جديد",
      close: "إغلاق",
    },
    access: {
      title: "صلاحيات جديدة",
      newSection: "فُتح لك قسم «{name}». هل تريد التعرّف عليه؟",
      newAbility: "أُضيفت لك صلاحيات جديدة في قسم «{name}»",
      showMe: "أرني",
      notNow: "ليس الآن",
    },
  },
};
