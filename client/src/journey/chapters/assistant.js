// Chapter 12: the assistant and its alerts. The chat is switched off in
// training mode (the demo store answers that the assistant is off, and a chat
// request answers DEMO), so the chapter shows the alerts tab only.
const assistant = {
  id: "journey-assistant",
  title: "المساعد والتنبيهات",
  route: "/dashboard",
  requires: "ai.use",
  steps: [
    {
      target: "assistant-button",
      mood: "point",
      title: "زر المساعد",
      body: "الرقم عدد التنبيهات غير المقروءة، وسأفتح الزر.",
      action: { type: "click", target: "assistant-button" },
    },
    {
      target: "assistant-tabs",
      mood: "explain",
      title: "التبويبات",
      body: "تبويب المحادثة يظهر عند تفعيل المساعد الذكي.",
    },
    {
      target: "assistant-alerts",
      mood: "point",
      title: "تنبيهاتك",
      body: "تنبيهات تخصّك، والضغط عليها ينقلك إلى مكانها.",
    },
    {
      target: "assistant-mark-all",
      mood: "point",
      title: "تحديد الكل كمقروء",
      body: "سأحدّد كل التنبيهات كمقروءة، فيختفي الرقم عن الزر.",
      action: { type: "click", target: "assistant-mark-all" },
    },
    {
      target: "assistant-button",
      mood: "point",
      title: "إغلاق اللوحة",
      body: "سأغلق اللوحة بالزر نفسه.",
      action: { type: "click", target: "assistant-button" },
    },
  ],
};

export default assistant;
