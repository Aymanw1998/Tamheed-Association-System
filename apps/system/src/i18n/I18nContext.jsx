import catalog from "../generated/permissions.json";
import { createContext, useContext, useEffect } from "react";

import { vehicleStrings } from "./vehicleStrings";
import { noticeStrings } from "./noticeStrings";
import { accessStrings } from "./accessStrings";
import { assistantStrings } from "./assistantStrings";
import { rosterStrings } from "./rosterStrings";
import { recordStrings } from "./recordStrings";
import { tourStrings } from "./tourStrings";
import { sportStrings } from "./sportStrings";

// The app is Arabic-only and right-to-left.
const translations = {
  ar: {
    appTitle: "جمعية تمهيد - الرملة",
    roles: {
      admin: "إدارة",
      guide: "مرشد",
      assistantGuide: "مساعد مرشد",
      system: "النظام",
    },
    nav: {
      ...catalog.labels.ar.modules,
      tasks: catalog.labels.ar.modules.tasks,
      dashboard: catalog.labels.ar.modules.dashboard,
      attendance: catalog.labels.ar.modules.attendance,
      students: catalog.labels.ar.modules.students,
      users: catalog.labels.ar.modules.users,
      lessons: catalog.labels.ar.modules.lessons,
      reports: catalog.labels.ar.modules.reports,
      files: catalog.labels.ar.modules.files,
      profile: "الملف الشخصي",
      guide: "دليل المستخدم",
      logout: "تسجيل الخروج",
      account: "حسابي",
      openMenu: "فتح القائمة",
      itSite: "قسم الIT",
      itSiteHint: "الانتقال إلى موقع قسم IT",
      itBlocked: "اسمح بالنوافذ المنبثقة ثم أعد المحاولة.",
      itFailed: "تعذّر فتح قسم الIT.",
    },
    common: {
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
      placeholder: "اكتب سؤالك هنا…",
      welcome: "مرحبًا، أنا مساعد تمهيد. اسألني عن التقارير أو الرسائل أو التنظيم، أو اطلب مساعدتي في أي صياغة تحتاجها.",
      prompts: [
        "لخّص لي حضور الطلاب هذا الأسبوع",
        "اقترح رسالة متابعة لولي أمر طالب",
        "ساعدني في صياغة تقرير مختصر",
      ],
      errors: {
        response: "تعذّر الحصول على رد من المساعد.",
        connection: "حدث خطأ أثناء الاتصال بالمساعد.",
        empty: "تم استلام الطلب، لكن لم يصل رد نصي واضح من خدمة الذكاء الاصطناعي.",
      },
      instruction: "Answer in Arabic. Keep the response practical and clear.",
    },
    files: {
      title: "الملفات",
      drive: { title: "Google Drive", statusOn: "متصل", statusOff: "غير متصل", notConnected: "غير متصل؛ لن تُحفظ الملفات والصور", connect: "ربط حساب Google Drive", replace: "تغيير الحساب", replaceConfirm: "هل تريد تغيير حساب Google Drive للنظام كله؟ ستُحفظ الملفات الجديدة في الحساب الجديد.", done: "تم ربط Google Drive بنجاح", denied: "رابط الربط غير صالح أو منتهي الصلاحية. حاول مرة أخرى من داخل النظام.", error: "تعذّر ربط Google Drive، حاول مرة أخرى.", startFailed: "تعذّر بدء الربط." },
      sharedTitle: "عرض مشترك",
      refresh: "تحديث",
      newFolder: "مجلد جديد",
      uploadFile: "رفع ملف",
      uploading: "جارٍ الرفع…",
      search: "ابحث في الملفات…",
      noFiles: "لا توجد ملفات",
      loading: "جارٍ تحميل الملفات…",
      refreshing: "جارٍ تحديث الملفات…",
      dropHere: "اسحب الملف وأفلته هنا",
      storage: "مساحة التخزين",
      storageInfo: "معلومات التخزين",
      used: "مستخدَمة",
      available: "متاح",
      total: "إجمالي المساحة",
      owner: "المالك",
      folder: "مجلد",
      open: "فتح",
      download: "تنزيل",
      share: "مشاركة",
      rename: "إعادة تسمية",
      delete: "حذف",
      options: "خيارات الملف",
      foldersAndFiles: "المجلدات والملفات",
    },
  },
};

// The vehicles section (and a few others) keep their (large) text in their own files.
const dictionary = translations.ar;
dictionary.vehicles = vehicleStrings.ar;
dictionary.nav.vehicles = catalog.labels.ar.modules.vehicles;
dictionary.sport = sportStrings.ar;
dictionary.nav.sports = catalog.labels.ar.modules.sports;
dictionary.notices = noticeStrings.ar;
dictionary.nav.notices = catalog.labels.ar.modules.notices;
dictionary.roster = rosterStrings.ar;
dictionary.record = recordStrings.ar;
dictionary.assistant = assistantStrings.ar;
dictionary.tour = tourStrings.ar;
dictionary.perms = accessStrings.ar.perms;
dictionary.passwordChange = accessStrings.ar.passwordChange;

const I18nContext = createContext(null);

const readPath = (source, key) =>
  String(key)
    .split(".")
    .reduce((value, part) => (value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined), source);

const t = (key, fallback = key) => readPath(dictionary, key) ?? fallback;
const value = { language: "ar", dir: "rtl", t };

// The language switch was removed; forget the old choice.
const LEGACY_LANGUAGE_KEY = "tamheed_language";

export function I18nProvider({ children }) {
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_LANGUAGE_KEY);
    } catch {}

    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
    document.body.dir = "rtl";
  }, []);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
