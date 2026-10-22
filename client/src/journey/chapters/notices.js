// Chapter 9: the administrators' notices board. Marking as read, the vehicle
// check (answered by the demo store), a new notice written field by field and
// published to the demo store, and the archive confirmation, which the guide
// cancels.
const notices = {
  id: "journey-notices",
  title: "لوحة الإعلانات",
  route: "/notices",
  requires: "notices.view",
  steps: [
    {
      target: "notices-list",
      mood: "point",
      title: "الإعلانات",
      body: "لاحظ الإعلانات الجديدة بخط عريض. فيها رسائل الإدارة وتنبيهات المركبات والنظام.",
    },
    {
      target: "notices-filters",
      mood: "point",
      title: "التصفية",
      body: "من هنا تعرض غير المقروءة فقط، أو فئة معيّنة، أو درجة أهمية.",
    },
    {
      target: "notices-mark-all",
      mood: "point",
      title: "تحديد الكل كمقروء",
      body: "سأحدّد كل الإعلانات كمقروءة، فيختفي عددها من الجرس في الأعلى.",
      action: { type: "click", target: "notices-mark-all" },
    },
    {
      target: "notices-run-check",
      requires: "notices.runCheck",
      mood: "point",
      title: "فحص المركبات",
      body: "سأشغّل فحص مواعيد المركبات الآن، فتظهر رسالة بعدد الإعلانات الجديدة التي أنشأها.",
      action: { type: "click", target: "notices-run-check" },
    },
    {
      target: "notices-publish",
      requires: "notices.post",
      mood: "explain",
      title: "إعلان جديد",
      body: "سأكتب إعلانًا جديدًا يصل إلى أعضاء الإدارة.",
    },
    {
      target: "notices-title",
      requires: "notices.post",
      mood: "explain",
      title: "عنوان الإعلان",
      body: "أبدأ بعنوان قصير، وهو حقل مطلوب.",
      action: { type: "type", target: "notices-title", value: "اجتماع تجريبي للطاقم" },
    },
    {
      target: "notices-body",
      requires: "notices.post",
      mood: "explain",
      title: "نص الإعلان",
      body: "ثم التفاصيل.",
      action: { type: "type", target: "notices-body", value: "يُعقد الاجتماع يوم الأحد الساعة الرابعة في الغرفة الأولى." },
    },
    {
      target: "notices-severity",
      requires: "notices.post",
      mood: "explain",
      title: "الأهمية",
      body: "أختار «مهم» ليبرز الإعلان في القائمة.",
      action: { type: "select", target: "notices-severity", value: "important" },
    },
    {
      target: "notices-submit",
      requires: "notices.post",
      mood: "point",
      title: "نشر الإعلان",
      body: "سأضغط «نشر»، فتظهر رسالة نجاح ويظهر الإعلان في القائمة.",
      action: { type: "click", target: "notices-submit" },
    },
    {
      target: "notices-archive",
      requires: "notices.post",
      mood: "warn",
      title: "أرشفة إعلان",
      body: "الأرشفة تخفي الإعلان عن جميع أعضاء الإدارة. سأفتح نافذة التأكيد لترى شكلها فقط.",
      action: { type: "click", target: "notices-archive" },
    },
    {
      target: "confirm-cancel",
      requires: "notices.post",
      mood: "explain",
      title: "إلغاء الأرشفة",
      body: "سأضغط «إلغاء» فيبقى الإعلان ظاهرًا.",
      action: { type: "cancelConfirm" },
    },
  ],
};

export default notices;
