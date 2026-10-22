// Chapter 11: the change log. The guide filters by the lessons section (the
// demo log always holds a lesson change with a field diff), opens the field
// changes of a row, and clears the filter.
const audit = {
  id: "journey-audit",
  title: "سجل التغييرات",
  route: "/audit",
  requires: "audit.view",
  steps: [
    {
      target: "audit-table",
      mood: "point",
      title: "سجل التغييرات",
      body: "كل إضافة أو تعديل أو حذف في النظام يُسجَّل هنا: متى، ومن نفّذه، وعلى أي عنصر. الأحدث أولًا.",
    },
    {
      target: "audit-filters",
      mood: "point",
      title: "التصفية",
      body: "يمكنك التصفية حسب التاريخ والقسم والعملية والمنفّذ، أو البحث بالنص.",
    },
    {
      target: "audit-module",
      mood: "explain",
      title: "اختيار القسم",
      body: "سأختار قسم الدروس.",
      action: { type: "select", target: "audit-module", value: "lessons" },
    },
    {
      target: "audit-apply",
      mood: "point",
      title: "تطبيق التصفية",
      body: "سأضغط «بحث»، فتبقى تغييرات الدروس وحدها.",
      action: { type: "click", target: "audit-apply" },
    },
    {
      target: "audit-changes",
      mood: "point",
      title: "تفاصيل التغيير",
      body: "سأفتح تفاصيل أحد التعديلات: لكل حقل تغيّر قيمته قبل التعديل وبعده.",
      action: { type: "click", target: "audit-changes" },
    },
    {
      target: "audit-pager",
      mood: "point",
      title: "الصفحات",
      body: "يعرض السجل خمسين تغييرًا في الصفحة، وهنا العدد الكلّي والتنقّل بين الصفحات.",
    },
    {
      target: "audit-clear",
      mood: "point",
      title: "مسح التصفية",
      body: "سأمسح التصفية لنعود إلى السجل كاملًا.",
      action: { type: "click", target: "audit-clear" },
    },
  ],
};

export default audit;
