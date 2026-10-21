// Section tours that SECTIONS refers to but that are not written yet; later tasks remove them.
export const PENDING_TOURS = [
  "dashboard", "calendar", "students", "lessons", "reports",
  "vehicles", "files", "notices", "users", "audit",
];

export const TOURS = [
  {
    id: "welcome",
    version: 1,
    route: null,
    detail: false,
    requires: null,
    steps: [
      {
        target: null,
        title: { ar: "أهلًا بك في تمهيد", he: "ברוכים הבאים לתמהיד", en: "Welcome to Tamheed" },
        body: {
          ar: "سنأخذك في جولة قصيرة للتعرف على أهم الأدوات. يمكنك تخطيها في أي وقت.",
          he: "נציג לך בקצרה את הכלים החשובים ביותר. אפשר לדלג בכל שלב.",
          en: "Here is a quick tour of the most useful tools. You can skip it at any time.",
        },
      },
      {
        target: "assistant-button",
        requires: "ai.use",
        title: { ar: "المساعد الذكي", he: "העוזר החכם", en: "The assistant" },
        body: {
          ar: "اسأل المساعد عن أي شيء في النظام وسيرشدك خطوة بخطوة.",
          he: "אפשר לשאול את העוזר על כל דבר במערכת והוא ילווה אותך צעד אחר צעד.",
          en: "Ask the assistant anything about the system and it will guide you step by step.",
        },
      },
      {
        target: "help-button",
        title: { ar: "مركز المساعدة", he: "מרכז העזרה", en: "Help center" },
        body: {
          ar: "من هنا يمكنك إعادة أي جولة تعريفية وقتما تشاء.",
          he: "מכאן אפשר להפעיל מחדש כל סיור הדרכה מתי שנוח לך.",
          en: "Replay any tour from here whenever you like.",
        },
      },
    ],
  },
];
