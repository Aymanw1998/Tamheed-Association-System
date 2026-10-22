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
      body: "سأرافقك في جولة على أقسام النظام، وأنفّذ أمامك الأعمال خطوة بخطوة. تابع معي بالضغط على «التالي».",
    },
    {
      target: null,
      mood: "warn",
      title: "وضع التدريب",
      body: "ما دام الشريط البرتقالي ظاهرًا في أعلى الصفحة فكل ما تراه بيانات تجريبية، ولا يُحفظ شيء في النظام.",
    },
    {
      target: "menu",
      mood: "point",
      title: "القائمة الرئيسية",
      body: "هنا كل الأقسام المتاحة لك. سأمرّ معك على كل قسم في فصل خاص به.",
    },
    {
      target: "notice-bell",
      requires: "notices.view",
      mood: "point",
      title: "الإعلانات",
      body: "يعرض الجرس عدد الإعلانات غير المقروءة. اضغط عليه لفتح لوحة الإعلانات.",
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
      body: "يمكنك الإيقاف المؤقت في أي وقت، وسنكمل لاحقًا من الفصل نفسه. ويمكنك تخطّي أي فصل.",
    },
  ],
};

export default intro;
