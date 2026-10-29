// The user guide (/guide): one entry per screen, in Arabic and Hebrew.
//
// When a screen changes, update its entry here in the same change and set
// `updated` to that day (add a letter for a second change the same day:
// 2026-10-29b). The guide marks an entry «جديد» for everyone who last saw
// another `updated`. guideContent.test.js fails while a
// section in tours/sections.js has no entry and is not listed in GUIDE_PENDING.
//
// Entry: { id: section key, path, chapterId (its journey chapter, for «أرني»),
//          updated: "YYYY-MM-DD" (+ optional letter), title, summary, steps: [{ requires?, text }] }
// Texts are { ar, he }. A step's `requires` is one permission key, or an array
// of keys that are all needed; steps the user cannot do are not shown.

export const GUIDE_LANGS = ["ar", "he"];

export const GUIDE_UI = {
  ar: {
    title: "دليل المستخدم",
    intro: "شرح قصير لكل شاشة. اضغط على الشاشة للتفاصيل، و«أرني» لتجربتها على بيانات تجريبية لا تُحفظ.",
    search: "ابحث في الدليل…",
    noResults: "لا توجد نتائج.",
    showMe: "أرني",
    newBadge: "جديد",
    updated: "آخر تحديث",
    open: "فتح الشاشة",
    language: "اللغة",
  },
  he: {
    title: "מדריך למשתמש",
    intro: "הסבר קצר לכל מסך. לחצו על מסך לפרטים, ועל «أرني» (הראה לי) כדי לנסות אותו על נתוני הדגמה שלא נשמרים.",
    search: "חיפוש במדריך…",
    noResults: "לא נמצאו תוצאות.",
    showMe: "הראה לי",
    newBadge: "חדש",
    updated: "עודכן",
    open: "פתח את המסך",
    language: "שפה",
  },
};

export const GUIDE = [
  {
    id: "dashboard",
    path: "/dashboard",
    chapterId: "journey-dashboard",
    updated: "2026-10-29",
    title: { ar: "لوحة التحكم", he: "לוח הבקרה" },
    summary: {
      ar: "الشاشة الأولى بعد الدخول: أرقام سريعة، طلبات تنتظر موافقتك، ودروس اليوم.",
      he: "המסך הראשון אחרי הכניסה: מספרים מהירים, בקשות שמחכות לאישור שלך, והשיעורים של היום.",
    },
    steps: [
      {
        text: {
          ar: "أرقام سريعة عن النظام، وروابط تنقلك مباشرة إلى الأقسام.",
          he: "מספרים מהירים על המערכת, וקישורים שמובילים ישר לכל מדור.",
        },
      },
      {
        requires: ["users.view", "users.approve"],
        text: {
          ar: "حسابات جديدة: «قبول» ثم اختر دور المستخدم.",
          he: "חשבונות חדשים: «قبول» (אישור) ואז בוחרים את תפקיד המשתמש.",
        },
      },
      {
        requires: ["users.view", "users.delete"],
        text: {
          ar: "«رفض» يحذف الحساب الجديد نهائيًا.",
          he: "«رفض» (דחייה) מוחק את החשבון החדש לצמיתות.",
        },
      },
      {
        requires: ["students.view", "students.edit"],
        text: {
          ar: "طلاب سجّلهم الأهل: «قبول» ينقلهم إلى قائمة الطلاب.",
          he: "תלמידים שההורים רשמו: «قبول» מעביר אותם לרשימת התלמידים.",
        },
      },
      {
        requires: ["students.view", "students.delete"],
        text: {
          ar: "«رفض» يحذف الطالب المنتظر نهائيًا.",
          he: "«رفض» מוחק את התלמיד הממתין לצמיתות.",
        },
      },
      {
        requires: "students.parentLink",
        text: {
          ar: "«رابط تسجيل الأهل» يُرسل للأهل ليسجّلوا أبناءهم بأنفسهم.",
          he: "«رابط تسجيل الأهل» (קישור הרשמה להורים) נשלח להורים כדי שירשמו את ילדיהם בעצמם.",
        },
      },
      {
        text: {
          ar: "«دروس اليوم»: اضغط «دخول» لفتح سجل حضور الدرس.",
          he: "«دروس اليوم» (שיעורי היום): לחיצה על «دخول» פותחת את רישום הנוכחות של השיעור.",
        },
      },
    ],
  },
  {
    id: "lessons",
    path: "/lessons",
    chapterId: "journey-lessons",
    updated: "2026-10-29",
    title: { ar: "الدروس", he: "שיעורים" },
    summary: {
      ar: "برنامج الدروس الأسبوعي: عرض وتصفية، وإنشاء درس وتعديله.",
      he: "תוכנית השיעורים השבועית: צפייה וסינון, יצירת שיעור ועריכתו.",
    },
    steps: [
      {
        text: {
          ar: "صفِّ الدروس حسب اليوم أو المكان أو المرشد، واضغط على درس لتفاصيله.",
          he: "מסננים לפי יום, מקום או מדריך, ולוחצים על שיעור כדי לראות את פרטיו.",
        },
      },
      {
        requires: "lessons.create",
        text: {
          ar: "«درس جديد»: الاسم، اليوم، ساعة البدء (45 دقيقة على الأقل)، المكان والمرشد.",
          he: "«درس جديد» (שיעור חדש): שם, יום, שעת התחלה (לפחות 45 דקות), מקום ומדריך.",
        },
      },
      {
        requires: "lessons.create",
        text: {
          ar: "أضف الطلاب بالاسم أو برقم الهوية، ثم «حفظ الدرس» وأكّد.",
          he: "מוסיפים תלמידים לפי שם או מספר זהות, ואז «حفظ الدرس» (שמירת השיעור) ומאשרים.",
        },
      },
      {
        requires: "lessons.edit",
        text: {
          ar: "افتح درسًا لتعديل قائمة طلابه، ولا يُحفظ شيء قبل «حفظ».",
          he: "פותחים שיעור כדי לערוך את רשימת התלמידים שלו. שום דבר לא נשמר לפני «حفظ» (שמירה).",
        },
      },
      {
        requires: ["lessons.edit", "lessons.delete"],
        text: {
          ar: "حذف الدرس نهائي ويطلب تأكيدًا.",
          he: "מחיקת שיעור היא סופית ודורשת אישור.",
        },
      },
    ],
  },
  {
    id: "calendar",
    path: "/calendar",
    chapterId: "journey-attendance",
    updated: "2026-10-29",
    title: { ar: "الحضور والغياب", he: "נוכחות" },
    summary: {
      ar: "تسجيل حضور دروس اليوم، ومراجعة الأيام السابقة.",
      he: "רישום נוכחות בשיעורי היום, וצפייה בימים קודמים.",
    },
    steps: [
      {
        text: {
          ar: "«دروس اليوم» لتسجيل الحضور، و«السجل» لمراجعته.",
          he: "«دروس اليوم» לרישום נוכחות, ו«السجل» (היסטוריה) לצפייה ברישומים.",
        },
      },
      {
        requires: "attendance.record",
        text: {
          ar: "افتح الدرس وسجّل لكل طالب: حاضر، غائب أو متأخر. الأزرار العلوية تسجّل الحالة نفسها للجميع.",
          he: "פותחים את השיעור ומסמנים לכל תלמיד: נוכח, נעדר או איחר. הכפתורים למעלה מסמנים את כולם בבת אחת.",
        },
      },
      {
        requires: "attendance.record",
        text: {
          ar: "لا يُحفظ شيء قبل «حفظ».",
          he: "שום דבר לא נשמר לפני «حفظ» (שמירה).",
        },
      },
      {
        text: {
          ar: "في «السجل» اختر الدرس ثم التاريخ لعرض حضوره.",
          he: "ב«السجل» בוחרים שיעור ואז תאריך כדי לראות את הנוכחות.",
        },
      },
    ],
  },
];

// Sections whose entry is not written yet. Remove a section from here when
// its entry is added above.
export const GUIDE_PENDING = ["students", "reports", "vehicles", "files", "notices", "users", "audit", "sports"];
