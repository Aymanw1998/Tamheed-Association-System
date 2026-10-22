// Chapter 5: attendance. The guide opens today's lesson, marks the first
// student absent, the second late and the third present, saves, then shows
// the history tab.
const attendance = {
  id: "journey-attendance",
  title: "الحضور والغياب",
  route: "/calendar",
  requires: null,
  steps: [
    {
      target: "calendar-tabs",
      mood: "point",
      title: "اليوم والسجل",
      body: "«دروس اليوم» لتسجيل حضور اليوم، و«السجل» لمراجعة ما سُجّل سابقًا.",
    },
    {
      target: "calendar-lessons",
      mood: "point",
      title: "دروس اليوم",
      body: "هنا دروسك لهذا اليوم، ويمكنك البحث باسم الدرس إن كثرت.",
    },
    {
      target: "calendar-lesson-open",
      mood: "point",
      title: "فتح الدرس",
      body: "سأفتح الدرس الأول لتظهر قائمة طلابه.",
      action: { type: "click", target: "calendar-lesson-open" },
    },
    {
      target: "calendar-quick",
      mood: "point",
      title: "تسجيل سريع",
      body: "هذه الأزرار تسجّل الحالة نفسها لكل الطلاب دفعة واحدة.",
    },
    {
      target: "calendar-mark-absent",
      requires: "attendance.record",
      mood: "point",
      title: "غائب",
      body: "سأسجّل الطالب الأول غائبًا.",
      action: { type: "click", target: "calendar-mark-absent" },
    },
    {
      target: "calendar-mark-late",
      requires: "attendance.record",
      mood: "point",
      title: "متأخر",
      body: "وأسجّل الطالب الثاني متأخرًا.",
      action: { type: "click", target: "calendar-mark-late" },
    },
    {
      target: "calendar-mark-present",
      requires: "attendance.record",
      mood: "point",
      title: "حاضر",
      body: "وأسجّل الطالب الثالث حاضرًا. يمكنك أيضًا كتابة ملاحظة بجانب كل طالب.",
      action: { type: "click", target: "calendar-mark-present" },
    },
    {
      target: "calendar-save",
      requires: "attendance.record",
      mood: "point",
      title: "حفظ الحضور",
      body: "لا يُحفظ شيء قبل الضغط على «حفظ». سأحفظ الآن، فتظهر رسالة نجاح.",
      action: { type: "click", target: "calendar-save" },
    },
    {
      target: "calendar-tab-history",
      mood: "point",
      title: "السجل",
      body: "سأفتح السجل لنراجع حضور الأيام السابقة.",
      action: { type: "click", target: "calendar-tab-history" },
    },
    {
      target: "calendar-lesson-open",
      mood: "point",
      title: "اختيار الدرس",
      body: "سأختار درسًا لتظهر التواريخ التي سُجّل فيها حضوره.",
      action: { type: "click", target: "calendar-lesson-open" },
    },
    {
      target: "calendar-dates",
      mood: "point",
      title: "اختيار التاريخ",
      body: "لاحظ قائمة التواريخ: يُختار منها اليوم لعرض سجله وتعديله إن لزم.",
    },
  ],
};

export default attendance;
