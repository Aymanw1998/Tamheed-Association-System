import { demoId } from "../demoData";

// Chapter 4: the lessons schedule, a new lesson filled field by field, its
// roster (the add-students window), then an existing lesson whose delete
// confirmation is opened and cancelled.
//
// The guide picks the demo guide (demoData.js: users[1]) as the lesson's
// guide. Only users who choose the guide see that field filled by the
// journey; others are set as the lesson's guide automatically.
const DEMO_GUIDE_ID = demoId(1, 2);

const lessons = {
  id: "journey-lessons",
  title: "البرامج",
  route: "/lessons",
  requires: null,
  steps: [
    {
      target: "lessons-filters",
      mood: "point",
      title: "الفلتر والعرض",
      body: "اضغط «فلتر» لاختيار اليوم أو المكان أو المرشد.",
    },
    {
      target: "lessons-calendar",
      mood: "point",
      title: "برنامج الأسبوع",
      body: "برنامج الأسبوع: اضغط على أي برنامج لتفاصيله.",
    },
    {
      target: "lessons-add",
      requires: "lessons.create",
      mood: "point",
      title: "برنامج جديد",
      body: "سأفتح نموذج برنامج جديد وأملؤه أمامك.",
      action: { type: "click", target: "lessons-add" },
    },
    {
      target: "lesson-name",
      requires: "lessons.create",
      mood: "explain",
      title: "اسم البرنامج",
      body: "أكتب اسمًا واضحًا للبرنامج.",
      action: { type: "type", target: "lesson-name", value: "ورشة تدريبية" },
    },
    {
      target: "lesson-day",
      requires: "lessons.create",
      mood: "explain",
      title: "يوم البرنامج",
      body: "أختار اليوم الذي يتكرر فيه البرنامج كل أسبوع.",
      action: { type: "select", target: "lesson-day", value: "3" },
    },
    {
      target: "lesson-start",
      requires: "lessons.create",
      mood: "explain",
      title: "ساعة البدء",
      body: "أحدد ساعة البدء، والبرنامج لا يقل عن خمس وأربعين دقيقة.",
      action: { type: "select", target: "lesson-start", value: "16:00" },
    },
    {
      target: "lesson-room",
      requires: "lessons.create",
      mood: "explain",
      title: "المكان",
      body: "أختار مكان البرنامج من القائمة.",
      action: { type: "select", target: "lesson-room", value: "3" },
    },
    {
      target: "lesson-teacher",
      requires: ["lessons.create", "students.viewAll"],
      mood: "explain",
      title: "المرشد",
      body: "أختار المرشد المسؤول، والمساعد اختياري.",
      action: { type: "select", target: "lesson-teacher", value: DEMO_GUIDE_ID },
    },
    {
      target: "roster-add",
      requires: "lessons.create",
      mood: "point",
      title: "طلاب البرنامج",
      body: "سأفتح نافذة إضافة الطلاب إلى البرنامج.",
      action: { type: "click", target: "roster-add" },
    },
    {
      target: "roster-picker",
      requires: "lessons.create",
      mood: "explain",
      title: "نافذة إضافة الطلاب",
      body: "ابحث بالاسم، أو أضف طالبًا برقم هويته.",
    },
    {
      target: "roster-picker-add",
      requires: "lessons.create",
      mood: "point",
      title: "إضافة طالب",
      body: "سأضيف الطالب الأول في القائمة.",
      action: { type: "click", target: "roster-picker-add" },
    },
    {
      target: "roster-picker-done",
      requires: "lessons.create",
      mood: "point",
      title: "إنهاء الإضافة",
      body: "سأضغط «تم» لأغلق النافذة.",
      action: { type: "click", target: "roster-picker-done" },
    },
    {
      target: "roster-list",
      requires: "lessons.create",
      mood: "point",
      title: "قائمة طلاب البرنامج",
      body: "تمت إضافة الطالب، ولا يُحفظ إلا بحفظ البرنامج.",
    },
    {
      target: "lesson-save",
      requires: "lessons.create",
      mood: "point",
      title: "حفظ البرنامج",
      body: "سأضغط «حفظ البرنامج» ثم أؤكد الإنشاء.",
      action: { type: "click", target: "lesson-save" },
    },
    {
      target: "confirm-ok",
      requires: "lessons.create",
      mood: "point",
      title: "تأكيد الإنشاء",
      body: "سأضغط «نعم»، فيظهر البرنامج الجديد في برنامج الأسبوع.",
      action: { type: "click", target: "confirm-ok" },
    },
    {
      target: "lessons-open",
      requires: "lessons.edit",
      mood: "point",
      title: "فتح برنامج",
      body: "سأفتح برنامجًا موجودًا لترى تفاصيله.",
      action: { type: "click", target: "lessons-open" },
    },
    {
      // A lesson now opens on its read-only page; the form is behind «تعديل».
      target: "lesson-view-edit",
      requires: "lessons.edit",
      mood: "point",
      title: "تعديل البرنامج",
      body: "هذه صفحة البرنامج. سأضغط «تعديل» لفتح النموذج.",
      action: { type: "click", target: "lesson-view-edit" },
    },
    {
      target: "lesson-roster",
      requires: "lessons.edit",
      mood: "point",
      title: "قائمة طلاب البرنامج",
      body: "قائمة طلاب البرنامج: بحث وإضافة وإزالة ثم حفظ.",
    },
    {
      target: "lesson-delete",
      requires: ["lessons.edit", "lessons.delete"],
      mood: "warn",
      title: "حذف البرنامج",
      body: "حذف البرنامج نهائي، وسأعرض نافذة التأكيد فقط.",
      action: { type: "click", target: "lesson-delete" },
    },
    {
      target: "confirm-cancel",
      requires: ["lessons.edit", "lessons.delete"],
      mood: "explain",
      title: "إلغاء الحذف",
      body: "سأضغط «إلغاء» فيبقى البرنامج كما هو.",
      action: { type: "cancelConfirm" },
    },
  ],
};

export default lessons;
