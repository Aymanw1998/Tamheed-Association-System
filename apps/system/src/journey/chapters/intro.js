// Chapter 1: the guide introduces itself, the training bar, the menu and the
// help button. "{name}" in a title or body becomes the guide's name.
const intro = {
  id: "journey-intro",
  title: "التعارف",
  route: "/dashboard",
  requires: null,
  steps: [
    {
      target: null,
      mood: "explain",
      title: "أهلًا، أنا {name}",
      body: "سأعرّفك على أقسام النظام خطوة بخطوة.",
    },
    {
      target: null,
      mood: "warn",
      title: "وضع التدريب",
      body: "الشريط البرتقالي يعني أن البيانات تجريبية ولا يُحفظ شيء.",
    },
    {
      target: "menu",
      mood: "point",
      title: "القائمة الرئيسية",
      body: "هنا كل الأقسام المتاحة لك.",
    },
    {
      target: "notice-bell",
      requires: "notices.view",
      mood: "point",
      title: "الإعلانات",
      body: "اضغط على الجرس لفتح الإعلانات.",
    },
    {
      target: "help-button",
      mood: "point",
      title: "مركز المساعدة",
      body: "من هنا تعود إلى المسار التدريبي متى شئت.",
    },
    {
      target: null,
      mood: "explain",
      title: "أنت تتحكّم في المسار",
      body: "يمكنك الإيقاف أو تخطّي أي فصل في أي وقت.",
    },
  ],
};

export default intro;
