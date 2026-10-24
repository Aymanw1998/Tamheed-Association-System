import { GUIDE_NAMES } from "./guideNames";

// The four steps of the first-visit guide, with the student's name and the guide's name filled in.
export const guideSteps = (firstname, guide) => [
  { mood: "explain", text: `أهلاً ${firstname}! أنا ${GUIDE_NAMES[guide] || GUIDE_NAMES.tamheed}، سأرافقك في جولة قصيرة في موقع تمهيد - رياضة.` },
  { mood: "point", text: "هذه بطاقتك كلاعب: رقم قميصك ومركزك وإحصائياتك. اضغط على البطاقة لتقلبها وترى بطاقتك الرسمية." },
  { mood: "point", text: "الحضور والتأخير يُحسبان تلقائيًا من دروسك، والإحصائيات يحدّثها المدرّب." },
  { mood: "celebrate", text: "في «دروسي» تجد مواعيد دروسك وسجل حضورك. بالتوفيق في الملعب!" },
];

export const GUIDE_SEEN_KEY = "tamheed-sport-guide-seen";
export const hasSeenGuide = () => {
  try { return localStorage.getItem(GUIDE_SEEN_KEY) === "1"; } catch { return false; }
};
export const markGuideSeen = () => {
  try { localStorage.setItem(GUIDE_SEEN_KEY, "1"); } catch { /* storage blocked */ }
};
