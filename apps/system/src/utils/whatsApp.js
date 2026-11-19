// «إرسال بواتساب» next to the parents' links (owner, 2026-11-16): opens
// WhatsApp (the app on a phone, WhatsApp Web on a computer) with the message
// ready, and the staff member picks the parent there. No number is sent.
export const whatsAppUrl = (text, url) =>
  `https://wa.me/?text=${encodeURIComponent([text, url].filter(Boolean).join("\n"))}`;

export const openWhatsApp = (text, url) => {
  window.open(whatsAppUrl(text, url), "_blank", "noopener,noreferrer");
};

export const REGISTRATION_TEXT = "السلام عليكم ورحمة الله وبركاته\nهذا رابط تسجيل الطالب في الجمعية:";
export const CONSENT_TEXT = "السلام عليكم ورحمة الله وبركاته\nيُرجى قراءة قوانين الجمعية والموافقة والتوقيع عبر هذا الرابط:";
