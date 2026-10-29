// "What's new" entries, newest first. Each needs a unique id such as
// `2026-10-21-xyz`, a date, `requires` (a permission, or null) and Arabic
// `title` and `body`. `tourId` is a guided-journey chapter id («أرني» runs that
// chapter alone; "journey-intro" starts the full journey), or null for no «أرني».
export const RELEASES = [
  {
    id: "2026-10-29-user-guide",
    date: "2026-10-29",
    requires: null,
    tourId: null,
    title: "دليل المستخدم",
    body: "شرح قصير لكل شاشة بالعربية أو بالعبرية، من القائمة أو من زر المساعدة. ما يتغيّر في النظام يظهر فيه بعلامة «جديد».",
  },
  {
    id: "2026-10-22-guided-journey",
    date: "2026-10-22",
    requires: null,
    tourId: "journey-intro",
    title: "المسار التدريبي",
    body: "يرافقك مرشد في مسار تدريبي قصير على أقسام النظام، ويعمل أمامك على بيانات تجريبية لا تُحفظ. يمكنك إيقافه متى شئت والمتابعة لاحقًا من زر المساعدة.",
  },
  {
    id: "2026-10-21-product-tour",
    date: "2026-10-21",
    requires: null,
    tourId: null,
    title: "مركز المساعدة الجديد",
    body: "أصبح بإمكانك إعادة أي جولة تعريفية في أي وقت من زر المساعدة. نتمنى لك تجربة ممتعة.",
  },
];
