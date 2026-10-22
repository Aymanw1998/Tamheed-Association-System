// Chapter 10: users and permissions. A waiting account is approved through
// the role picker, an account is opened, its role changed, and on the
// permissions tab one operation is granted, saved, then revoked and saved:
// every save lands in the demo store.
//
// The demo store holds two waiting accounts, so one is left here even after
// the dashboard chapter approved the other. The users list hides the
// signed-in user and sorts by name; the first account the viewer manages is
// «ريم التجريبية» (an assistant), so «مرشد» is a promotion with no demotion
// warning. «إضافة» in the students module is not in the assistant's or the
// guide's defaults, so ticking it is a grant.
const users = {
  id: "journey-users",
  title: "المستخدمون والصلاحيات",
  route: "/users",
  requires: "users.view",
  steps: [
    {
      target: "users-search",
      mood: "point",
      title: "البحث",
      body: "لاحظ حقل البحث: يكفي جزء من الاسم أو رقم الهوية.",
    },
    {
      target: "users-status-filter",
      mood: "point",
      title: "حالة الحساب",
      body: "الحسابات ثلاث فئات: فعّال، وبانتظار الموافقة، وموقوف.",
    },
    {
      target: "users-tab-waiting",
      mood: "point",
      title: "بانتظار الموافقة",
      body: "سأعرض الحسابات التي تنتظر الموافقة.",
      action: { type: "click", target: "users-tab-waiting" },
    },
    {
      target: "users-approve",
      requires: ["users.view", "users.approve"],
      mood: "point",
      title: "قبول حساب",
      body: "سأضغط «قبول». لا يُقبل حساب إلا بدور، فتُفتح نافذة اختيار الدور.",
      action: { type: "click", target: "users-approve" },
    },
    {
      target: "role-picker-select",
      requires: ["users.view", "users.approve"],
      mood: "explain",
      title: "اختيار الدور",
      body: "تعرض القائمة الأدوار الأدنى من دورك فقط. سأعتمد الدور المقترح.",
    },
    {
      target: "role-picker-approve",
      requires: ["users.view", "users.approve"],
      mood: "point",
      title: "تأكيد القبول",
      body: "سأضغط «قبول»، فتظهر رسالة نجاح وينتقل الحساب إلى الحسابات الفعّالة.",
      action: { type: "click", target: "role-picker-approve" },
    },
    {
      target: "users-tab-active",
      mood: "point",
      title: "الحسابات الفعّالة",
      body: "سأعود إلى الحسابات الفعّالة.",
      action: { type: "click", target: "users-tab-active" },
    },
    {
      target: "users-table",
      mood: "point",
      title: "قائمة المستخدمين",
      body: "لكل حساب دوره وأزراره. لا يظهر «تعديل» إلا للحسابات الأدنى من دورك.",
    },
    {
      target: "users-edit",
      mood: "point",
      title: "فتح حساب",
      body: "سأفتح أول حساب تستطيع إدارته.",
      action: { type: "click", target: "users-edit" },
    },
    {
      target: "user-account",
      mood: "explain",
      title: "بيانات الحساب",
      body: "رقم الهوية لا يتغيّر بعد التسجيل، وتحته دور المستخدم. الدور يُحفظ وحده، لا مع بقية البيانات.",
    },
    {
      target: "user-role-select",
      requires: "users.changeRole",
      mood: "explain",
      title: "تغيير الدور",
      body: "أختار دور «مرشد». خفض الدور يلغي الصلاحيات الخاصة، لذلك يطلب النظام تأكيدًا عند الخفض.",
      action: { type: "select", target: "user-role-select", value: "مرشد" },
    },
    {
      target: "user-role-save",
      requires: "users.changeRole",
      mood: "point",
      title: "حفظ الدور",
      body: "سأضغط «حفظ الدور»، فتظهر رسالة نجاح.",
      action: { type: "click", target: "user-role-save" },
    },
    {
      target: "confirm-ok",
      requires: ["users.changeRole", "permissions.manage"],
      mood: "point",
      title: "إضافة صلاحيات",
      body: "يسأل النظام هل تضيف صلاحيات خاصة الآن. سأضغط «الآن» لننتقل إلى تبويب الصلاحيات.",
      action: { type: "click", target: "confirm-ok" },
    },
    {
      target: "user-tab-permissions",
      requires: "permissions.manage",
      mood: "point",
      title: "تبويب الصلاحيات",
      body: "سأفتح تبويب الصلاحيات.",
      action: { type: "click", target: "user-tab-permissions" },
    },
    {
      target: "user-permissions",
      requires: "permissions.manage",
      mood: "explain",
      title: "صلاحيات الحساب",
      body: "لكل قسم مفتاح، وتحته عملياته. بجانب كل عملية مصدرها: من الدور، أو ممنوحة، أو مسحوبة.",
    },
    {
      target: "perms-expand-students",
      requires: "permissions.manage",
      mood: "point",
      title: "عمليات القسم",
      body: "سأفتح عمليات قسم الطلاب.",
      action: { type: "click", target: "perms-expand-students" },
    },
    {
      target: "perms-grant-example",
      requires: "permissions.manage",
      mood: "explain",
      title: "منح صلاحية",
      body: "سأمنح عملية «إضافة»، فيستطيع صاحب الحساب إضافة الطلاب.",
      action: { type: "click", target: "perms-grant-example" },
    },
    {
      target: "perms-save",
      requires: "permissions.manage",
      mood: "point",
      title: "حفظ الصلاحيات",
      body: "سأضغط «حفظ». يعرض النظام ما أُضيف وما سُحب، ويطلب التأكيد.",
      action: { type: "click", target: "perms-save" },
    },
    {
      target: "confirm-ok",
      requires: "permissions.manage",
      mood: "point",
      title: "تأكيد المنح",
      body: "سأؤكد، فتظهر رسالة نجاح وتُعلَّم العملية «ممنوح».",
      action: { type: "click", target: "confirm-ok" },
    },
    {
      target: "perms-grant-example",
      requires: "permissions.manage",
      mood: "explain",
      title: "سحب الصلاحية",
      body: "والسحب بالطريقة نفسها: سأزيل العلامة عن «إضافة».",
      action: { type: "click", target: "perms-grant-example" },
    },
    {
      target: "perms-save",
      requires: "permissions.manage",
      mood: "point",
      title: "حفظ السحب",
      body: "سأضغط «حفظ» مرة أخرى.",
      action: { type: "click", target: "perms-save" },
    },
    {
      target: "confirm-ok",
      requires: "permissions.manage",
      mood: "point",
      title: "تأكيد السحب",
      body: "سأؤكد، فيعود الحساب إلى صلاحيات دوره.",
      action: { type: "click", target: "confirm-ok" },
    },
  ],
};

export default users;
