// Text for the "?" help center, the new-access card, "what's new" and the user
// page's journey status. Merged in I18nContext as `tour`.
// The guided journey's own text lives in journey/chapters/.
// {name}, {done} and {skipped} are filled in by the code.

export const tourStrings = {
  ar: {
    userStatus: {
      title: "المسار التدريبي",
      intro: "الفصل الأول (التعارف):",
      status: { done: "أنهاه", skipped: "تخطّاه", none: "لم يره بعد" },
      chapters: "فصول المسار: {done} مكتملة، {skipped} متخطّاة",
      reset: "اعرضه مجددًا عند الدخول القادم",
      resetDone: "سيُعرض المسار التدريبي على هذا المستخدم عند دخوله القادم.",
      resetFailed: "تعذّرت إعادة المسار التدريبي، حاول مرة أخرى.",
    },
    help: {
      button: "مركز المساعدة",
      title: "مركز المساعدة",
      intro: "شاهد المسار التدريبي كاملًا أو فصلًا منه، أو اطّلع على آخر التحديثات.",
      fullJourney: "المسار التدريبي كاملًا",
      explainScreen: "شرح هذه الشاشة",
      noScreenChapter: "لا يوجد فصل لهذه الشاشة.",
      whatsNew: "ما الجديد",
      chaptersTitle: "فصول المسار",
      start: "ابدأ",
      noChapters: "لا توجد فصول متاحة حاليًا.",
      status: { done: "أنهيته", skipped: "تخطّيته", none: "لم تشاهده بعد" },
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
