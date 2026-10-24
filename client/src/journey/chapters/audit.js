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
      body: "يُسجَّل هنا كل تغيير: متى ومن ولأي عنصر.",
    },
    {
      target: "audit-filters",
      mood: "point",
      title: "التصفية",
      body: "صفِّ حسب التاريخ أو القسم أو العملية أو المنفّذ.",
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
      body: "سأفتح تفاصيل تعديل لترى القيم قبله وبعده.",
      action: { type: "click", target: "audit-changes" },
    },
    {
      target: "audit-pager",
      mood: "point",
      title: "الصفحات",
      body: "العدد الكلّي والتنقّل بين صفحات السجل.",
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
