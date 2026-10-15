// Public privacy policy (shown at /privacy and linked from Google's consent
// screen). Keep the three languages section-for-section in step; the test in
// privacyContent.test.js checks that. "{contact}" is replaced on the page.

export const PRIVACY_UPDATED = "2026-10-15";
export const PRIVACY_CONTACT = "tamheedramla@gmail.com";

export const PRIVACY_CONTENT = {
  ar: {
    title: "سياسة الخصوصية - نظام جمعية تمهيد",
    intro: "يُستعمل هذا النظام داخليًا لإدارة نشاطات جمعية تمهيد في الرملة. توضح هذه الصفحة ما نحفظه من معلومات، ولماذا، وكيف نحميها.",
    updated: "آخر تحديث",
    sections: [
      {
        heading: "ما المعلومات التي نحفظها",
        items: [
          "بيانات الطاقم والمستخدمين: الاسم، رقم الهوية، الهاتف، البريد الإلكتروني، الدور والصلاحيات.",
          "بيانات الطلاب: الاسم، رقم الهوية، تفاصيل التواصل مع الأهل، الصورة، الدروس والحضور.",
          "التقارير، ومعلومات المركبات والمقطورات: الرخص والتأمين والفحوصات ومستنداتها.",
          "ملفات يرفعها المستخدمون إلى مدير الملفات.",
        ],
      },
      {
        heading: "لماذا نستعمل المعلومات",
        items: [
          "لتشغيل نشاطات الجمعية فقط: إدارة الطلاب والحضور والدروس والتقارير والمركبات.",
          "لإرسال تنبيهات للإدارة عن مستندات المركبات التي يقترب انتهاؤها.",
          "لا نبيع المعلومات ولا نعرضها للإعلانات ولا نشاركها مع جهات خارجية إلا كما هو مذكور أدناه.",
        ],
      },
      {
        heading: "Google Drive",
        items: [
          "الصور والملفات تُحفظ في حساب Google Drive واحد تابع للجمعية.",
          "يطلب النظام الصلاحية drive.file فقط، أي أنه يصل إلى الملفات التي أنشأها النظام نفسه ولا يرى أي ملفات أخرى في الحساب.",
          "الملفات خاصة ولا تُنشأ لها روابط عامة؛ فتحها يتم من داخل النظام بعد فحص صلاحية المستخدم.",
          "يُستعمل عنوان البريد الإلكتروني للحساب المرتبط فقط لعرض أي حساب متصل.",
        ],
      },
      {
        heading: "خدمات أخرى نستعملها",
        items: [
          "قاعدة البيانات مستضافة لدى MongoDB Atlas.",
          "عند استعمال زر «قراءة مستند»، يُرسل المستند إلى خدمة Claude من Anthropic لاستخراج تفاصيل الرخصة أو التأمين فقط، والنتيجة تُعرض كاقتراح ولا تُحفظ إلا بموافقة المستخدم.",
          "رسائل البريد الإلكتروني للتنبيهات تُرسل عبر مزوّد البريد الخاص بالجمعية.",
        ],
      },
      {
        heading: "الحماية والوصول",
        items: [
          "الدخول إلى النظام بحساب شخصي فقط، وكل مستخدم يرى ما تسمح به صلاحياته.",
          "الاتصال مشفّر (HTTPS)، وكلمات المرور محفوظة بشكل مشفّر.",
          "ربط حساب Google Drive أو تغييره متاح لحساب النظام فقط.",
        ],
      },
      {
        heading: "حقوقك والتواصل",
        items: [
          "يمكنك طلب الاطلاع على معلوماتك أو تصحيحها أو حذفها.",
          "للأسئلة والطلبات: {contact}",
        ],
      },
    ],
  },
  he: {
    title: "מדיניות פרטיות - מערכת עמותת תמהיד",
    intro: "המערכת משמשת באופן פנימי לניהול פעילות עמותת תמהיד ברמלה. בעמוד זה מוסבר איזה מידע אנחנו שומרים, למה, ואיך אנחנו מגינים עליו.",
    updated: "עודכן לאחרונה",
    sections: [
      {
        heading: "איזה מידע נשמר",
        items: [
          "פרטי צוות ומשתמשים: שם, מספר זהות, טלפון, דוא\"ל, תפקיד והרשאות.",
          "פרטי תלמידים: שם, מספר זהות, פרטי קשר של ההורים, תמונה, שיעורים ונוכחות.",
          "דוחות, ומידע על רכבים ועגלות: רישיונות, ביטוחים, טסטים והמסמכים שלהם.",
          "קבצים שמשתמשים מעלים למנהל הקבצים.",
        ],
      },
      {
        heading: "למה אנחנו משתמשים במידע",
        items: [
          "רק לניהול פעילות העמותה: תלמידים, נוכחות, שיעורים, דוחות ורכבים.",
          "כדי לשלוח להנהלה התראות על מסמכי רכב שתוקפם מתקרב לסיום.",
          "איננו מוכרים מידע, לא משתמשים בו לפרסום ולא משתפים אותו עם גורמים חיצוניים, מלבד המפורט למטה.",
        ],
      },
      {
        heading: "Google Drive",
        items: [
          "תמונות וקבצים נשמרים בחשבון Google Drive אחד של העמותה.",
          "המערכת מבקשת רק את ההרשאה drive.file, כלומר היא ניגשת רק לקבצים שהיא עצמה יצרה ואינה רואה קבצים אחרים בחשבון.",
          "הקבצים פרטיים ולא נוצרים להם קישורים ציבוריים; פתיחתם נעשית מתוך המערכת אחרי בדיקת הרשאת המשתמש.",
          "כתובת הדוא\"ל של החשבון המחובר משמשת רק כדי להציג איזה חשבון מחובר.",
        ],
      },
      {
        heading: "שירותים נוספים שאנחנו משתמשים בהם",
        items: [
          "מסד הנתונים מאוחסן ב-MongoDB Atlas.",
          "בשימוש בכפתור «קריאת מסמך», המסמך נשלח לשירות Claude של Anthropic רק כדי לחלץ את פרטי הרישיון או הביטוח; התוצאה מוצגת כהצעה ונשמרת רק באישור המשתמש.",
          "הודעות דוא\"ל של התראות נשלחות דרך ספק הדוא\"ל של העמותה.",
        ],
      },
      {
        heading: "אבטחה וגישה",
        items: [
          "הכניסה למערכת היא בחשבון אישי בלבד, וכל משתמש רואה רק את מה שההרשאות שלו מאפשרות.",
          "החיבור מוצפן (HTTPS), וסיסמאות נשמרות בצורה מוצפנת.",
          "חיבור או החלפה של חשבון Google Drive זמינים לחשבון המערכת בלבד.",
        ],
      },
      {
        heading: "הזכויות שלך ויצירת קשר",
        items: [
          "אפשר לבקש לעיין במידע שלך, לתקן אותו או למחוק אותו.",
          "לשאלות ובקשות: {contact}",
        ],
      },
    ],
  },
  en: {
    title: "Privacy Policy - Tamheed Association System",
    intro: "This system is used internally to manage the activities of the Tamheed Association in Ramla. This page explains what information we keep, why, and how we protect it.",
    updated: "Last updated",
    sections: [
      {
        heading: "What we store",
        items: [
          "Staff and user details: name, ID number, phone, email, role and permissions.",
          "Student details: name, ID number, parent contact details, photo, lessons and attendance.",
          "Reports, and vehicle and trailer information: licences, insurance, tests and their documents.",
          "Files users upload to the file manager.",
        ],
      },
      {
        heading: "Why we use it",
        items: [
          "Only to run the association's activities: students, attendance, lessons, reports and vehicles.",
          "To alert administrators about vehicle documents that are about to expire.",
          "We do not sell information, use it for advertising, or share it with third parties except as described below.",
        ],
      },
      {
        heading: "Google Drive",
        items: [
          "Photos and files are stored in a single Google Drive account belonging to the association.",
          "The system requests only the drive.file permission: it can access only the files it created itself and cannot see any other files in the account.",
          "Files are private and no public links are created; they are opened from inside the system after the user's permission is checked.",
          "The connected account's email address is used only to show which account is connected.",
        ],
      },
      {
        heading: "Other services we use",
        items: [
          "The database is hosted on MongoDB Atlas.",
          "When the \"Read document\" button is used, the document is sent to Anthropic's Claude service only to extract the licence or insurance details; the result is shown as a suggestion and saved only if the user approves it.",
          "Alert emails are sent through the association's email provider.",
        ],
      },
      {
        heading: "Security and access",
        items: [
          "Access requires a personal account, and each user sees only what their permissions allow.",
          "Connections are encrypted (HTTPS) and passwords are stored encrypted.",
          "Connecting or changing the Google Drive account is limited to the system account.",
        ],
      },
      {
        heading: "Your rights and contact",
        items: [
          "You can ask to see, correct or delete your information.",
          "Questions and requests: {contact}",
        ],
      },
    ],
  },
};
