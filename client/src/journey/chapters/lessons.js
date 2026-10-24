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
  title: "الدروس",
  route: "/lessons",
  requires: null,
  steps: [
    {
      target: "lessons-filters",
      mood: "point",
      title: "التصفية والعرض",
      body: "صفِّ الدروس حسب اليوم أو المكان أو المرشد.",
    },
    {
      target: "lessons-calendar",
      mood: "point",
      title: "برنامج الدروس",
      body: "برنامج الأسبوع: اضغط على أي درس لتفاصيله.",
    },
    {
      target: "lessons-add",
      requires: "lessons.create",
      mood: "point",
      title: "درس جديد",
      body: "سأفتح نموذج درس جديد وأملؤه أمامك.",
      action: { type: "click", target: "lessons-add" },
    },
    {
      target: "lesson-name",
      requires: "lessons.create",
      mood: "explain",
      title: "اسم الدرس",
      body: "أكتب اسمًا واضحًا للدرس.",
      action: { type: "type", target: "lesson-name", value: "ورشة تدريبية" },
    },
    {
      target: "lesson-day",
      requires: "lessons.create",
      mood: "explain",
      title: "يوم الدرس",
      body: "أختار اليوم الذي يتكرر فيه الدرس كل أسبوع.",
      action: { type: "select", target: "lesson-day", value: "3" },
    },
    {
      target: "lesson-start",
      requires: "lessons.create",
      mood: "explain",
      title: "ساعة البدء",
      body: "أحدد ساعة البدء، والدرس لا يقل عن خمس وأربعين دقيقة.",
      action: { type: "select", target: "lesson-start", value: "16:00" },
    },
    {
      target: "lesson-room",
      requires: "lessons.create",
      mood: "explain",
      title: "المكان",
      body: "أختار مكان الدرس من القائمة.",
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
      title: "طلاب الدرس",
      body: "سأفتح نافذة إضافة الطلاب إلى الدرس.",
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
      title: "قائمة طلاب الدرس",
      body: "تمت إضافة الطالب، ولا يُحفظ إلا بحفظ الدرس.",
    },
    {
      target: "lesson-save",
      requires: "lessons.create",
      mood: "point",
      title: "حفظ الدرس",
      body: "سأضغط «حفظ الدرس» ثم أؤكد الإنشاء.",
      action: { type: "click", target: "lesson-save" },
    },
    {
      target: "confirm-ok",
      requires: "lessons.create",
      mood: "point",
      title: "تأكيد الإنشاء",
      body: "سأضغط «نعم»، فيظهر الدرس الجديد في برنامج الأسبوع.",
      action: { type: "click", target: "confirm-ok" },
    },
    {
      target: "lessons-open",
      requires: "lessons.edit",
      mood: "point",
      title: "فتح درس",
      body: "سأفتح درسًا موجودًا لترى تفاصيله.",
      action: { type: "click", target: "lessons-open" },
    },
    {
      target: "lesson-roster",
      requires: "lessons.edit",
      mood: "point",
      title: "قائمة طلاب الدرس",
      body: "قائمة طلاب الدرس: بحث وإضافة وإزالة ثم حفظ.",
    },
    {
      target: "lesson-delete",
      requires: ["lessons.edit", "lessons.delete"],
      mood: "warn",
      title: "حذف الدرس",
      body: "حذف الدرس نهائي، وسأعرض نافذة التأكيد فقط.",
      action: { type: "click", target: "lesson-delete" },
    },
    {
      target: "confirm-cancel",
      requires: ["lessons.edit", "lessons.delete"],
      mood: "explain",
      title: "إلغاء الحذف",
      body: "سأضغط «إلغاء» فيبقى الدرس كما هو.",
      action: { type: "cancelConfirm" },
    },
  ],
};

export default lessons;
