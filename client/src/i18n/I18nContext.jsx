import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { vehicleStrings } from "./vehicleStrings";
import { noticeStrings } from "./noticeStrings";
import { accessStrings } from "./accessStrings";
import { rosterStrings } from "./rosterStrings";

const LANGUAGE_KEY = "tamheed_language";

export const languages = {
  ar: { code: "ar", label: "العربية", dir: "rtl" },
  he: { code: "he", label: "עברית", dir: "rtl" },
  en: { code: "en", label: "English", dir: "ltr" },
};

const translations = {
  ar: {
    appTitle: "جمعية تمهيد - الرملة",
    roles: {
      admin: "إدارة",
      guide: "مرشد",
      assistantGuide: "مساعد مرشد",
    },
    nav: {
      dashboard: "لوحة التحكم",
      attendance: "حضور وغياب",
      students: "قائمة الطلاب",
      users: "قائمة المستخدمين",
      lessons: "قائمة الدروس",
      reports: "قائمة التقارير",
      files: "مدير الملفات",
      profile: "ملف شخصي",
      logout: "خروج",
      openMenu: "فتح القائمة",
    },
    common: {
      language: "اللغة",
      new: "جديد",
      close: "إغلاق",
      ready: "جاهز",
      send: "إرسال",
      sending: "...",
      you: "أنت",
    },
    ai: {
      title: "المساعد الذكي",
      open: "فتح المساعد الذكي",
      assistantName: "المساعد",
      thinking: "جارٍ التفكير",
      placeholder: "اكتب سؤالك هنا...",
      welcome: "مرحباً، أنا مساعد تمهيد. اسألني عن التقارير، الرسائل، التنظيم أو أي صياغة تحتاجها.",
      prompts: [
        "لخص لي حضور الطلاب هذا الأسبوع",
        "اقترح رسالة متابعة لولي أمر طالب",
        "ساعدني في صياغة تقرير مختصر",
      ],
      errors: {
        response: "تعذر الحصول على رد من المساعد",
        connection: "حدث خطأ أثناء الاتصال بالمساعد",
        empty: "تم استلام الطلب، لكن لم يصل رد نصي واضح من خدمة الذكاء الاصطناعي.",
      },
      instruction: "Answer in Arabic. Keep the response practical and clear.",
    },
    files: {
      title: "ملفات",
      drive: { title: "Google Drive", statusOn: "متصل", statusOff: "غير متصل", notConnected: "غير متصل، الملفات والصور لن تُحفظ", connect: "ربط حساب Google Drive", replace: "تغيير الحساب", replaceConfirm: "تغيير حساب Drive للنظام كله؟ الملفات الجديدة ستُحفظ في الحساب الجديد.", done: "تم ربط Google Drive", denied: "رابط الربط غير صالح أو منتهي، حاول مرة أخرى من داخل النظام", error: "تعذّر ربط Google Drive، حاول مرة أخرى", startFailed: "تعذّر بدء الربط", systemOnly: "ربط الحساب أو تغييره متاح لحساب النظام فقط" },
      sharedTitle: "عرض مشترك",
      refresh: "تحديث",
      newFolder: "مجلد جديد",
      uploadFile: "رفع ملف",
      uploading: "جار الرفع...",
      search: "ابحث في الملفات...",
      noFiles: "لا توجد ملفات",
      loading: "جار تحميل الملفات...",
      refreshing: "جار تحديث الملفات...",
      dropHere: "اسحب الملف وأفلته هنا",
      storage: "مساحة التخزين",
      used: "قيد الاستخدام",
      available: "متاح",
      total: "إجمالي المساحة",
      owner: "المالك",
      folder: "مجلد",
      open: "فتح",
      download: "تحميل",
      share: "مشاركة",
      rename: "إعادة تسمية",
      delete: "حذف",
      options: "خيارات الملف",
      foldersAndFiles: "المجلدات والملفات",
    },
  },
  he: {
    appTitle: "עמותת תמיהיד - רמלה",
    roles: {
      admin: "ניהול",
      guide: "מדריך",
      assistantGuide: "עוזר מדריך",
    },
    nav: {
      dashboard: "לוח בקרה",
      attendance: "נוכחות והיעדרות",
      students: "רשימת תלמידים",
      users: "רשימת משתמשים",
      lessons: "רשימת שיעורים",
      reports: "רשימת דוחות",
      files: "מנהל קבצים",
      profile: "פרופיל אישי",
      logout: "יציאה",
      openMenu: "פתיחת תפריט",
    },
    common: {
      language: "שפה",
      new: "חדש",
      close: "סגירה",
      ready: "מוכן",
      send: "שליחה",
      sending: "...",
      you: "אתה",
    },
    ai: {
      title: "המסייע החכם",
      open: "פתיחת המסייע החכם",
      assistantName: "המסייע",
      thinking: "חושב",
      placeholder: "כתוב כאן את השאלה...",
      welcome: "שלום, אני המסייע של תמיהיד. אפשר לשאול אותי על דוחות, הודעות, ארגון או ניסוח.",
      prompts: [
        "סכם לי את נוכחות התלמידים השבוע",
        "הצע הודעת מעקב להורה של תלמיד",
        "עזור לי לנסח דוח קצר",
      ],
      errors: {
        response: "לא התקבלה תשובה מהמסייע",
        connection: "אירעה שגיאה בחיבור למסייע",
        empty: "הבקשה התקבלה, אבל לא חזרה תשובה טקסטואלית ברורה משירות ה-AI.",
      },
      instruction: "Answer in Hebrew. Keep the response practical and clear.",
    },
    files: {
      title: "קבצים",
      drive: { title: "Google Drive", statusOn: "מחובר", statusOff: "לא מחובר", notConnected: "לא מחובר, קבצים ותמונות לא יישמרו", connect: "חיבור חשבון Google Drive", replace: "החלפת חשבון", replaceConfirm: "להחליף את חשבון ה-Drive של כל המערכת? קבצים חדשים יישמרו בחשבון החדש.", done: "Google Drive חובר", denied: "קישור החיבור לא תקף או שפג, נסה שוב מתוך המערכת", error: "החיבור ל-Google Drive נכשל, נסה שוב", startFailed: "לא ניתן להתחיל את החיבור", systemOnly: "חיבור או החלפת החשבון זמינים לחשבון המערכת בלבד" },
      sharedTitle: "תצוגה משותפת",
      refresh: "רענון",
      newFolder: "תיקייה חדשה",
      uploadFile: "העלאת קובץ",
      uploading: "מעלה...",
      search: "חיפוש בקבצים...",
      noFiles: "אין קבצים",
      loading: "טוען קבצים...",
      refreshing: "מעדכן קבצים...",
      dropHere: "גרור קובץ ושחרר כאן",
      storage: "אחסון",
      used: "בשימוש",
      available: "פנוי",
      total: "סך הכל",
      owner: "בעלים",
      folder: "תיקייה",
      open: "פתיחה",
      download: "הורדה",
      share: "שיתוף",
      rename: "שינוי שם",
      delete: "מחיקה",
      options: "אפשרויות קובץ",
      foldersAndFiles: "תיקיות וקבצים",
    },
  },
  en: {
    appTitle: "Tamheed Association - Ramla",
    roles: {
      admin: "Admin",
      guide: "Guide",
      assistantGuide: "Assistant guide",
    },
    nav: {
      dashboard: "Dashboard",
      attendance: "Attendance",
      students: "Students",
      users: "Users",
      lessons: "Lessons",
      reports: "Reports",
      files: "Files",
      profile: "Profile",
      logout: "Logout",
      openMenu: "Open menu",
    },
    common: {
      language: "Language",
      new: "New",
      close: "Close",
      ready: "Ready",
      send: "Send",
      sending: "...",
      you: "You",
    },
    ai: {
      title: "AI Assistant",
      open: "Open AI assistant",
      assistantName: "Assistant",
      thinking: "Thinking",
      placeholder: "Type your question here...",
      welcome: "Hi, I am Tamheed assistant. Ask me about reports, messages, planning, or any wording you need.",
      prompts: [
        "Summarize student attendance this week",
        "Suggest a follow-up message for a student's parent",
        "Help me write a short report",
      ],
      errors: {
        response: "Could not get a response from the assistant",
        connection: "Something went wrong while contacting the assistant",
        empty: "The request was received, but the AI service did not return a clear text response.",
      },
      instruction: "Answer in English. Keep the response practical and clear.",
    },
    files: {
      title: "Files",
      drive: { title: "Google Drive", statusOn: "Connected", statusOff: "Not connected", notConnected: "Not connected, files and photos will not be saved", connect: "Connect Google Drive account", replace: "Change account", replaceConfirm: "Change the Drive account for the whole system? New files will be saved to the new account.", done: "Google Drive connected", denied: "The connect link is invalid or expired, start again from inside the system", error: "Connecting Google Drive failed, try again", startFailed: "Could not start the connection", systemOnly: "Only the system account can connect or change the account" },
      sharedTitle: "Shared view",
      refresh: "Refresh",
      newFolder: "New folder",
      uploadFile: "Upload file",
      uploading: "Uploading...",
      search: "Search files...",
      noFiles: "No files",
      loading: "Loading files...",
      refreshing: "Refreshing files...",
      dropHere: "Drop the file here",
      storage: "Storage",
      used: "Used",
      available: "Available",
      total: "Total space",
      owner: "Owner",
      folder: "Folder",
      open: "Open",
      download: "Download",
      share: "Share",
      rename: "Rename",
      delete: "Delete",
      options: "File options",
      foldersAndFiles: "Folders and files",
    },
  },
};

// The vehicles section keeps its (large) text in its own file.
for (const code of Object.keys(translations)) {
  translations[code].vehicles = vehicleStrings[code];
  translations[code].nav.vehicles = vehicleStrings[code].navTitle;
  translations[code].notices = noticeStrings[code];
  translations[code].nav.notices = noticeStrings[code].navTitle;
  translations[code].roster = rosterStrings[code];
  translations[code].perms = accessStrings[code].perms;
  translations[code].audit = accessStrings[code].audit;
  translations[code].passwordChange = accessStrings[code].passwordChange;
  translations[code].systemRecovery = accessStrings[code].systemRecovery;
  translations[code].nav.audit = accessStrings[code].audit.navTitle;
}

const I18nContext = createContext(null);

const getStoredLanguage = () => {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return languages[stored] ? stored : "ar";
  } catch {
    return "ar";
  }
};

const readPath = (source, key) =>
  String(key)
    .split(".")
    .reduce((value, part) => (value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined), source);

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(getStoredLanguage);

  const setLanguage = (nextLanguage) => {
    if (!languages[nextLanguage]) return;
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    const meta = languages[language] || languages.ar;

    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {}

    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;
    document.body.dir = meta.dir;
  }, [language]);

  const value = useMemo(() => {
    const meta = languages[language] || languages.ar;
    const dictionary = translations[language] || translations.ar;

    return {
      language,
      setLanguage,
      dir: meta.dir,
      languageMeta: meta,
      languages,
      t: (key, fallback = key) => readPath(dictionary, key) ?? readPath(translations.ar, key) ?? fallback,
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
