// Chapter 13: the profile and the change-password form. The guide fills the
// form and then presses «إلغاء», which empties it: the change is never
// submitted, not even in training mode (the request would be blocked anyway).
// The values are placeholders, hidden by the password fields.
const profile = {
  id: "journey-profile",
  title: "الملف الشخصي",
  route: "/profile",
  requires: null,
  steps: [
    {
      target: "profile-account",
      mood: "point",
      title: "بيانات حسابك",
      body: "هذه صفحتك أنت. رقم هويتك للعرض فقط، ولا يتغيّر من هنا.",
    },
    {
      target: "profile-password",
      mood: "explain",
      title: "تغيير كلمة المرور",
      body: "سأملأ نموذج تغيير كلمة المرور لترى خطواته، ثم ألغيه دون إرسال.",
    },
    {
      target: "password-current",
      mood: "explain",
      title: "كلمة المرور الحالية",
      body: "أولًا كلمة المرور الحالية، ليتأكد النظام أنك صاحب الحساب.",
      action: { type: "type", target: "password-current", value: "demo-current" },
    },
    {
      target: "password-new",
      mood: "explain",
      title: "كلمة المرور الجديدة",
      body: "ثم الجديدة: ثمانية أحرف على الأقل، ومختلفة عن الحالية.",
      action: { type: "type", target: "password-new", value: "demo-new-2026" },
    },
    {
      target: "password-confirm",
      mood: "explain",
      title: "تأكيد كلمة المرور",
      body: "وأكتبها مرة ثانية للتأكيد.",
      action: { type: "type", target: "password-confirm", value: "demo-new-2026" },
    },
    {
      target: "password-cancel",
      mood: "explain",
      title: "لن أرسل التغيير",
      body: "عند الضغط على «تغيير كلمة المرور» تنتهي جلساتك الأخرى. في التدريب سأضغط «إلغاء»، فتُمسح الحقول.",
      action: { type: "click", target: "password-cancel" },
    },
    {
      target: "profile-personal",
      mood: "point",
      title: "بياناتك الشخصية",
      body: "الاسم وتاريخ الميلاد والجنس، وتحتها السكن ووسائل التواصل.",
    },
    {
      target: "profile-photo",
      mood: "point",
      title: "صورتك",
      body: "من هنا تضيف صورتك أو تغيّرها.",
    },
    {
      target: "profile-save",
      mood: "point",
      title: "حفظ التعديلات",
      body: "بعد تعديل بياناتك اضغط «حفظ التعديلات». هذا آخر فصل في المسار، ويمكنك العودة إلى أي فصل من زر «؟».",
    },
  ],
};

export default profile;
