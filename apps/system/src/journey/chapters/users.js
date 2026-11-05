// Chapter 10: users. A waiting account is approved through the role picker,
// an account is opened and its role changed: every save lands in the demo
// store. Permissions are an IT matter, on the IT site.
//
// The demo store holds two waiting accounts, so one is left here even after
// the dashboard chapter approved the other. The users list hides the
// signed-in user and sorts by name; the first account the viewer manages is
// «ريم التجريبية» (an assistant), so «مرشد» is a promotion with no demotion
// warning.
const users = {
  id: "journey-users",
  title: "المستخدمون",
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
      target: "users-tab-waiting",
      mood: "point",
      title: "الطلبات",
      body: "ثلاث لوائح: الأعضاء والطلبات والموقوفون. سأعرض «الطلبات».",
      action: { type: "click", target: "users-tab-waiting" },
    },
    {
      target: "users-approve",
      requires: ["users.view", "users.approve"],
      mood: "point",
      title: "قبول حساب",
      body: "سأضغط «قبول» لاختيار الدور أولًا.",
      action: { type: "click", target: "users-approve" },
    },
    {
      target: "role-picker-select",
      requires: ["users.view", "users.approve"],
      mood: "explain",
      title: "اختيار الدور",
      body: "تعرض القائمة الأدوار الأدنى من دورك، وسأعتمد المقترح.",
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
      title: "الأعضاء",
      body: "سأعود إلى لائحة «الأعضاء».",
      action: { type: "click", target: "users-tab-active" },
    },
    {
      target: "users-table",
      mood: "point",
      title: "قائمة المستخدمين",
      body: "لا يظهر «تعديل» إلا للحسابات الأدنى من دورك.",
    },
    {
      target: "users-edit",
      mood: "point",
      title: "فتح حساب",
      body: "سأفتح أول حساب تستطيع إدارته.",
      action: { type: "click", target: "users-edit" },
    },
    {
      // On a phone the card opens the user's read-only page; the form is
      // behind «تعديل». Skipped on its own where the click already opened the form.
      target: "user-view-edit",
      mood: "point",
      title: "تعديل الحساب",
      body: "هذه صفحة المستخدم. سأضغط «تعديل» لفتح الحساب.",
      action: { type: "click", target: "user-view-edit" },
    },
    {
      target: "user-account",
      mood: "explain",
      title: "بيانات الحساب",
      body: "رقم الهوية ثابت، والدور يُحفظ وحده.",
    },
    {
      target: "user-role-select",
      requires: "users.changeRole",
      mood: "explain",
      title: "تغيير الدور",
      body: "أختار دور «مرشد»، وخفض الدور يتطلب تأكيدًا.",
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
  ],
};

export default users;
