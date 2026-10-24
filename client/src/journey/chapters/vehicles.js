// Chapter 8: vehicles. The list, one vehicle's record, a document opened as
// the in-page demo preview (journey/demoDocument.js: no new tab, no
// download), the periodic test with a new test record saved to the demo store,
// and the archive confirmation, which the guide cancels.
//
// Vehicle buttons follow the user's vehicle permissions (vehicles.*), which
// the page reads from the server; each step requires the same key.
const vehicles = {
  id: "journey-vehicles",
  title: "المركبات",
  route: "/vehicles",
  requires: "vehicles.view",
  steps: [
    {
      target: "vehicles-summary",
      mood: "point",
      title: "ملخّص المركبات",
      body: "بطاقات الأعداد، والضغط على بطاقة يصفّي القائمة.",
    },
    {
      target: "vehicles-filters",
      mood: "point",
      title: "البحث والتصفية",
      body: "ابحث برقم اللوحة أو الاسم، أو صفِّ بالنوع والحالة.",
    },
    {
      target: "vehicles-table",
      mood: "point",
      title: "قائمة المركبات",
      body: "موعد انتهاء كل مستند بلون يبيّن قرب الموعد.",
    },
    {
      target: "vehicles-open",
      mood: "point",
      title: "ملف المركبة",
      body: "سأفتح ملف «حافلة التدريب».",
      action: { type: "click", target: "vehicles-open" },
    },
    {
      target: "vehicle-basic",
      mood: "explain",
      title: "البيانات الأساسية",
      body: "بيانات المركبة، وزر «تعديل» لمن يملك الصلاحية.",
    },
    {
      target: "vehicle-tabs",
      mood: "point",
      title: "أقسام الملف",
      body: "لكل مركبة رخصة وفحص وتأمين، ولكل منها تبويب.",
    },
    {
      target: "vehicle-documents",
      requires: "vehicles.documents",
      mood: "point",
      title: "المستندات",
      body: "سأفتح تبويب المستندات.",
      action: { type: "click", target: "vehicle-documents" },
    },
    {
      target: "vehicle-doc-view",
      requires: "vehicles.documents",
      mood: "point",
      title: "عرض مستند",
      body: "سأعرض نسخة الرخصة داخل الصفحة بلا تنزيل.",
      action: { type: "click", target: "vehicle-doc-view" },
    },
    {
      target: "demo-document-close",
      requires: "vehicles.documents",
      mood: "point",
      title: "إغلاق المستند",
      body: "هكذا يظهر المستند. سأغلقه الآن.",
      action: { type: "click", target: "demo-document-close" },
    },
    {
      target: "vehicle-tab-test",
      mood: "point",
      title: "الفحص الدوري",
      body: "سأفتح تبويب الفحص الدوري.",
      action: { type: "click", target: "vehicle-tab-test" },
    },
    {
      target: "vehicle-next-test",
      mood: "explain",
      title: "موعد الفحص القادم",
      body: "لاحظ موعد الفحص القادم، ولونه يتغيّر مع قربه.",
    },
    {
      target: "vehicle-record-add",
      requires: "vehicles.compliance",
      mood: "point",
      title: "تسجيل فحص",
      body: "سأسجّل فحصًا جديدًا أمامك.",
      action: { type: "click", target: "vehicle-record-add" },
    },
    {
      target: "vehicle-test-date",
      requires: "vehicles.compliance",
      mood: "explain",
      title: "تاريخ الفحص",
      body: "أكتب تاريخ إجراء الفحص.",
      action: { type: "type", target: "vehicle-test-date", value: "2026-10-15" },
    },
    {
      target: "vehicle-test-result",
      requires: "vehicles.compliance",
      mood: "explain",
      title: "نتيجة الفحص",
      body: "أختار النتيجة «ناجح»، وهي حقل مطلوب.",
      action: { type: "select", target: "vehicle-test-result", value: "passed" },
    },
    {
      target: "vehicle-test-next",
      requires: "vehicles.compliance",
      mood: "explain",
      title: "الفحص التالي",
      body: "ثم موعد الفحص التالي، فيتحدّث موعد التنبيه تلقائيًّا.",
      action: { type: "type", target: "vehicle-test-next", value: "2027-10-15" },
    },
    {
      target: "vehicle-record-save",
      requires: "vehicles.compliance",
      mood: "point",
      title: "حفظ الفحص",
      body: "سأضغط «حفظ»، فتظهر رسالة نجاح.",
      action: { type: "click", target: "vehicle-record-save" },
    },
    {
      target: "vehicle-archive",
      requires: "vehicles.archive",
      mood: "warn",
      title: "أرشفة المركبة",
      body: "الأرشفة توقف المركبة وتنبيهاتها، وسأعرض التأكيد فقط.",
      action: { type: "click", target: "vehicle-archive" },
    },
    {
      target: "confirm-cancel",
      requires: "vehicles.archive",
      mood: "explain",
      title: "إلغاء الأرشفة",
      body: "سأضغط «إلغاء» فتبقى المركبة في العمل.",
      action: { type: "cancelConfirm" },
    },
  ],
};

export default vehicles;
