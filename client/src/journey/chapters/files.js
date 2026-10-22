// Chapter 7: files. The guide «chooses» a demo file built in memory (the real
// file picker never opens, see Components/Files/FilesPage.jsx) and uploads it
// through the files service into the demo store, creates a folder in the
// in-page window, shares it, and opens a delete confirmation it cancels.
//
// The new folder's name starts with «أ», so it sorts first among the demo
// folders and the first «مشاركة» button is the new folder's.
const files = {
  id: "journey-files",
  title: "الملفات",
  route: "/files",
  requires: "files.use",
  steps: [
    {
      target: "files-path",
      mood: "point",
      title: "مكانك في الملفات",
      body: "لاحظ هذا السطر: يبيّن المجلد الذي تقف فيه، والضغط على أي جزء منه يعيدك إليه.",
    },
    {
      target: "files-storage",
      mood: "point",
      title: "مساحة التخزين",
      body: "هنا ترى المساحة المستعملة والمتبقية.",
    },
    {
      target: "files-upload",
      mood: "point",
      title: "رفع ملف",
      body: "سأرفع ملفًّا. في وضع التدريب أختار ملفًّا تجريبيًّا جاهزًا، فلا تُفتح نافذة اختيار الملفات من جهازك.",
      action: { type: "click", target: "files-upload" },
    },
    {
      target: "files-items",
      mood: "explain",
      title: "الملف المرفوع",
      body: "بعد اكتمال الرفع تظهر رسالة نجاح، ويظهر ملف «خطة الأسبوع» بين الملفات.",
    },
    {
      target: "files-new-folder",
      mood: "point",
      title: "مجلد جديد",
      body: "سأنشئ مجلدًا جديدًا لترتيب الملفات.",
      action: { type: "click", target: "files-new-folder" },
    },
    {
      target: "files-folder-name",
      mood: "explain",
      title: "اسم المجلد",
      body: "أكتب اسم المجلد.",
      action: { type: "type", target: "files-folder-name", value: "أنشطة الصيف" },
    },
    {
      target: "files-folder-create",
      mood: "point",
      title: "إنشاء المجلد",
      body: "سأضغط «إنشاء المجلد»، فيظهر المجلد أول القائمة.",
      action: { type: "click", target: "files-folder-create" },
    },
    {
      target: "files-search",
      mood: "point",
      title: "البحث",
      body: "لاحظ حقل البحث: يصفّي ما في المجلد الحالي بالاسم أو بصاحب الملف.",
    },
    {
      target: "files-share",
      mood: "point",
      title: "مشاركة المجلد",
      body: "سأفتح نافذة المشاركة للمجلد الجديد.",
      action: { type: "click", target: "files-share" },
    },
    {
      target: "files-share-role",
      mood: "explain",
      title: "نوع الصلاحية",
      body: "أختار «تعديل»، فيستطيع الزميل إضافة الملفات وتعديلها، دون أن يشارك المجلد مع غيره.",
      action: { type: "select", target: "files-share-role", value: "write" },
    },
    {
      target: "files-share-user",
      mood: "point",
      title: "اختيار الزميل",
      body: "سأختار أول زميل في القائمة، فتظهر رسالة نجاح وعبارة «تمت المشاركة» بجانب اسمه.",
      action: { type: "click", target: "files-share-user" },
    },
    {
      target: "files-share-dialog",
      mood: "explain",
      title: "إلغاء المشاركة",
      body: "الضغط على الزميل مرة أخرى بالصلاحية نفسها يلغي المشاركة معه.",
    },
    {
      target: "files-share-close",
      mood: "point",
      title: "إغلاق النافذة",
      body: "سأغلق نافذة المشاركة.",
      action: { type: "click", target: "files-share-close" },
    },
    {
      target: "files-delete",
      mood: "warn",
      title: "حذف عنصر",
      body: "حذف المجلد يحذف كل ما فيه، ولا يمكن التراجع عنه. سأفتح نافذة التأكيد لترى شكلها فقط.",
      action: { type: "click", target: "files-delete" },
    },
    {
      target: "confirm-cancel",
      mood: "explain",
      title: "إلغاء الحذف",
      body: "سأضغط «إلغاء» فلا يُحذف شيء.",
      action: { type: "cancelConfirm" },
    },
  ],
};

export default files;
