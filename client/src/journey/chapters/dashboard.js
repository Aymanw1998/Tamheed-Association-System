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
      body: "لاحظ هنا ملخص أهم الأعداد في النظام: المستخدمون والطلاب ودروس اليوم والتقارير.",
    },
    {
      target: "dashboard-links",
      mood: "point",
      title: "روابط سريعة",
      body: "من هنا تنتقل مباشرة إلى القسم الذي تريده.",
    },
    {
      target: "dashboard-waiting-users",
      requires: "users.view",
      mood: "point",
      title: "حسابات بانتظار الموافقة",
      body: "هنا الحسابات الجديدة التي تنتظر موافقتك. سأقبل الآن حسابًا تجريبيًا أمامك.",
    },
    {
      target: "dashboard-approve-user",
      requires: "users.approve",
      mood: "point",
      title: "قبول مستخدم",
      body: "سأضغط «قبول». يفتح النظام نافذة تطلب اختيار دور المستخدم قبل تفعيل حسابه.",
      action: { type: "click", target: "dashboard-approve-user" },
    },
    {
      target: "role-picker-select",
      requires: "users.approve",
      mood: "explain",
      title: "اختيار الدور",
      body: "اختر الدور المناسب للمستخدم. لا تظهر هنا إلا الأدوار التي يحق لك منحها.",
    },
    {
      target: "role-picker-approve",
      requires: "users.approve",
      mood: "point",
      title: "تفعيل الحساب",
      body: "سأضغط «قبول» ليُفعَّل الحساب بهذا الدور، ثم يختفي من قائمة الانتظار.",
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
      requires: "students.edit",
      mood: "point",
      title: "قبول طالب",
      body: "سأقبل الطالب الأول. يطلب النظام تأكيد الحفظ قبل التنفيذ.",
      action: { type: "click", target: "dashboard-approve-student" },
    },
    {
      target: "confirm-ok",
      requires: "students.edit",
      mood: "point",
      title: "تأكيد القبول",
      body: "سأضغط «نعم»، فينتقل الطالب إلى قائمة الطلاب الفعّالين.",
      action: { type: "click", target: "confirm-ok" },
    },
    {
      target: "dashboard-reject-student",
      requires: "students.delete",
      mood: "warn",
      title: "رفض طالب",
      body: "«رفض» يحذف الطالب من قائمة الانتظار نهائيًا. سأفتح نافذة التأكيد لترى شكلها فقط.",
      action: { type: "click", target: "dashboard-reject-student" },
    },
    {
      target: "confirm-cancel",
      requires: "students.delete",
      mood: "explain",
      title: "إلغاء الرفض",
      body: "سأضغط «إلغاء» فلا يُحذف شيء. لا تؤكّد الرفض إلا إذا كنت متأكدًا منه.",
      action: { type: "cancelConfirm" },
    },
    {
      target: "dashboard-parent-link",
      requires: "students.parentLink",
      mood: "point",
      title: "رابط تسجيل الأهل",
      body: "انسخ هذا الرابط وأرسله إلى الأهل ليسجّلوا أبناءهم بأنفسهم.",
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
      body: "«دخول» يفتح سجل الحضور لهذا الدرس مباشرة. سنعود إلى الحضور في فصل خاص به.",
    },
  ],
};

export default dashboard;
