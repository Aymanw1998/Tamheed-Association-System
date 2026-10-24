// Chapter 2: the dashboard and the requests waiting for approval. The guide
// approves the demo account waiting for a role (RolePickerDialog), approves a
// pending student, and opens the reject confirmation only to cancel it.
const dashboard = {
  id: "journey-dashboard",
  title: "لوحة التحكم",
  route: "/dashboard",
  requires: null,
  steps: [
    {
      target: "dashboard-stats",
      mood: "point",
      title: "أرقام سريعة",
      body: "ملخص لأهم أعداد النظام.",
    },
    {
      target: "dashboard-links",
      mood: "point",
      title: "روابط سريعة",
      body: "روابط تنقلك مباشرة إلى الأقسام.",
    },
    {
      target: "dashboard-waiting-users",
      requires: "users.view",
      mood: "point",
      title: "حسابات بانتظار الموافقة",
      body: "حسابات جديدة تنتظر «قبول» أو «رفض».",
    },
    {
      target: "dashboard-approve-user",
      requires: ["users.view", "users.approve"],
      mood: "point",
      title: "قبول مستخدم",
      body: "سأضغط «قبول» لاختيار دور المستخدم.",
      action: { type: "click", target: "dashboard-approve-user" },
    },
    {
      target: "role-picker-select",
      requires: ["users.view", "users.approve"],
      mood: "explain",
      title: "اختيار الدور",
      body: "سأعتمد الدور الافتراضي، ويمكنك اختيار غيره.",
    },
    {
      target: "role-picker-approve",
      requires: ["users.view", "users.approve"],
      mood: "point",
      title: "تفعيل الحساب",
      body: "سأضغط «قبول» لتفعيل الحساب بهذا الدور.",
      action: { type: "click", target: "role-picker-approve" },
    },
    {
      target: "dashboard-waiting-students",
      requires: "students.view",
      mood: "point",
      title: "طلاب بانتظار الموافقة",
      body: "هؤلاء طلاب سجّلهم الأهل عبر رابط التسجيل، وينتظرون موافقتك.",
    },
    {
      target: "dashboard-approve-student",
      requires: ["students.view", "students.edit"],
      mood: "point",
      title: "قبول طالب",
      body: "سأقبل الطالب الأول، ويطلب النظام تأكيد الحفظ قبل التنفيذ.",
      action: { type: "click", target: "dashboard-approve-student" },
    },
    {
      target: "confirm-ok",
      requires: ["students.view", "students.edit"],
      mood: "point",
      title: "تأكيد القبول",
      body: "سأضغط «نعم»، فينتقل الطالب إلى قائمة الطلاب الفعّالين.",
      action: { type: "click", target: "confirm-ok" },
    },
    {
      target: "dashboard-reject-student",
      requires: ["students.view", "students.delete"],
      mood: "warn",
      title: "رفض طالب",
      body: "«رفض» يحذف الطالب نهائيًا، وسأعرض التأكيد فقط.",
      action: { type: "click", target: "dashboard-reject-student" },
    },
    {
      target: "confirm-cancel",
      requires: ["students.view", "students.delete"],
      mood: "explain",
      title: "إلغاء الرفض",
      body: "سأضغط «إلغاء» فلا يُحذف شيء.",
      action: { type: "cancelConfirm" },
    },
    {
      target: "dashboard-parent-link",
      requires: "students.parentLink",
      mood: "point",
      title: "رابط تسجيل الأهل",
      body: "رابط يُرسل للأهل ليسجّلوا أبناءهم بأنفسهم.",
    },
    {
      target: "dashboard-lessons",
      mood: "point",
      title: "دروس اليوم",
      body: "هنا دروس اليوم مرتبة حسب الوقت، ومعها الدروس القادمة.",
    },
    {
      target: "dashboard-lesson-enter",
      mood: "point",
      title: "الدخول إلى الدرس",
      body: "«دخول» يفتح سجل الحضور لهذا الدرس.",
    },
  ],
};

export default dashboard;
