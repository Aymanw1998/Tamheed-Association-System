# قراءة مستندات المركبات، الفحص الليلي، ولوحة إعلانات الإدارة: التصميم

- **التاريخ:** 2026-10-14
- **الحالة:** بانتظار مراجعة صاحب المشروع
- **المنفّذ:** Claude · **المراجع:** Codex (عند توفره)

## الهدف

1. رفع صورة أو PDF لرخصة مركبة أو بوليصة تأمين، فيستخرج النظام البيانات (اللوحة، الشركة
   المصنّعة، التواريخ...) ويعرضها كاقتراح يملأ النموذج بعد موافقة المستخدم.
2. فحص تلقائي كل ليلة الساعة 01:00 بتوقيت إسرائيل لكل المركبات والمقطورات: الرخصة، التأمين
   والفحص السنوي (الطست). كل ما ينتهي قريبًا أو انتهى يصل إلى كل الإدارة.
3. لوحة إعلانات للإدارة: تنبيهات النظام (المركبات وغيرها) ورسائل يكتبها المدراء.

## ما هو موجود اليوم

- **المركبات:** `server/Entities/Vehicle/`. كل مركبة فيها مصفوفات `licenses` (`validUntil`)،
  `tests` و`nextTestDate`، `policies` (`startDate`, `endDate`)، و`documents` (Google Drive).
  التواريخ نص `YYYY-MM-DD`، و"اليوم" هو التاريخ في `Asia/Jerusalem` (`todayInJerusalem`).
- **التنبيهات تُحسب عند الطلب فقط:** `rules.buildAlerts` و`GET /api/vehicle/alerts`
  بعتبات `DEFAULT_ALERT_DAYS = [30, 14, 7]`. لا يوجد شيء يعمل وحده ويبلّغ أحدًا.
- **مهام مجدولة:** `server/utils/daily.js` فيه مهمة `node-cron` الساعة 23:59 (`Asia/Jerusalem`).
- **الذكاء الاصطناعي:** `@anthropic-ai/sdk` مثبّت، و`ANTHROPIC_API_KEY` فارغ حاليًا.
  مسار `/api/ai/chat` معطّل (`AI_ENABLED = false`) لأنه بلا تسجيل دخول.
- **البريد:** `server/utils/sendEmail.js` (nodemailer عبر `SMTP_*`).
- **الإدارة:** دور `ادارة` (`isAdminUser` في `vehicleRules.js`).
- **SSE:** `/api/events` يبثّ لكل المتصلين بلا فحص صلاحيات، لذلك لا نستعمله هنا.

## القرارات (وافق عليها صاحب المشروع)

| الموضوع | القرار |
| --- | --- |
| محرّك القراءة | Claude AI (`claude-opus-5-5`، مع `fallbacks: "default"` عند الرفض) عبر `ANTHROPIC_API_KEY` |
| المستندات المدعومة | رخصة مركبة، بوليصة تأمين |
| الحفظ | لا شيء يُحفظ تلقائيًا: النتيجة اقتراح يراجعه المستخدم |
| وقت الفحص | كل يوم 01:00 بتوقيت `Asia/Jerusalem` |
| أول تنبيه | قبل 60 يومًا من الانتهاء |
| التذكيرات | مراحل: 60، 30، 14، 7 أيام، يوم الانتهاء، ثم مرة كل أسبوع بعد الانتهاء حتى التجديد |
| من يستلم | كل من لديه دور `ادارة` |
| القنوات | لوحة الإعلانات + رسالة بريد ملخّصة واحدة لكل مدير، فقط عند وجود جديد |
| من يكتب في اللوحة | النظام والمدراء |

## الجزء 1: قراءة المستندات

### الخادم

- **`POST /api/vehicle/extract`** (في `Vehicle.route.js`): `requireAuth` + `can("compliance")`
  + حدّ معدل (`rateLimit`، 20 طلبًا في 15 دقيقة) + `uploadOne` الموجود.
  - الحقول: `file` (إلزامي)، `vehicleId` (اختياري، لمقارنة اللوحة)، `expected`
    (`license` | `policy` | `any`، الافتراضي `any`).
  - الأنواع: `image/jpeg`، `image/png`، `image/webp`، `application/pdf`، حتى 10MB.
    يُفحص المحتوى الفعلي عبر `inspectDocument` الموجود، لا الامتداد فقط.
- **خدمة جديدة `server/services/vehicleDocExtract.service.js`:**
  - ترسل الملف إلى Claude ككتلة `image` أو `document` (base64)، مع تعليمات تطلب JSON فقط
    حسب المخطط أدناه، وتقول صراحة: "إذا لم تكن القيمة واضحة في المستند اتركها null".
  - تستعمل structured output (`output_config.format` بمخطط JSON) حتى يكون الرد قابلًا للتحليل.
  - بلا مفتاح ⇒ `{ available: false, reason: "not_configured" }` (لا رمي استثناء).
  - أخطاء Claude (مصادقة، حدّ معدل، مهلة 30 ثانية) ⇒ `{ available: false, reason }`.
- **مخطط الرد من Claude:**

  ```json
  {
    "documentType": "license | policy | unknown",
    "plate": "string|null",
    "vehicle": { "make": "", "model": "", "year": 0, "color": "", "chassisNumber": "" },
    "license": { "validFrom": "YYYY-MM-DD", "validUntil": "YYYY-MM-DD", "feeAmount": 0 },
    "policy": {
      "insurer": "", "policyNumber": "",
      "type": "mandatory | third_party | comprehensive | other",
      "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "cost": 0
    },
    "notes": "string|null"
  }
  ```

- **تنظيف الرد (دالة نقية `sanitizeExtraction` في الخدمة، مختبرة):**
  - كل تاريخ يمرّ عبر `isValidDateOnly`. التاريخ غير الصالح يصبح `null` مع تحذير.
  - اللوحة عبر `normalizePlate` و`validatePlate`.
  - `type` (نوع البوليصة) من `POLICY_TYPES` فقط، وإلا `other`.
  - إذا وصل `vehicleId` ولوحة المستند لا تطابق لوحة المركبة ⇒ تحذير `plate_mismatch`.
  - `endDate < startDate` أو `validUntil < validFrom` ⇒ تحذير.
- **الرد للعميل:**
  `{ ok: true, available: true, source: { model, extractedAt }, documentType, proposed, warnings: [] }`.
  الملف لا يُحفظ في هذا الطلب.

### العميل

- **مكوّن جديد `client/src/Components/Vehicle/DocumentScan.jsx`:** زر "📄 قراءة مستند" + اختيار
  ملف + حالة تحميل + عرض الاقتراح والتحذيرات بنفس أسلوب `OfficialLookup.jsx`.
  - "تطبيق" يملأ حقول النموذج المفتوح (رخصة أو تأمين أو بيانات المركبة). "إلغاء" يتجاهل.
  - بعد التطبيق: خيار "إرفاق هذا الملف بالسجل" يستعمل رفع المستندات الموجود
    (`POST /:id/documents`) بعد حفظ السجل.
- **أماكن الزر:** نموذج إضافة رخصة، نموذج إضافة تأمين (`VehicleRecords.jsx`)، ونموذج مركبة جديدة
  (`EditVehicle.jsx`، لبيانات المركبة فقط).
- **بلا مفتاح:** الزر معطّل مع نص "قراءة المستندات غير مفعّلة على الخادم".
- **النصوص:** في `client/src/i18n/vehicleStrings.js` بالعربية والعبرية والإنجليزية.

## الجزء 2: الفحص الليلي

### العتبات

- `DEFAULT_ALERT_DAYS` يصبح `[60, 30, 14, 7, 0]`. هذا يغيّر أيضًا صفحة المركبات: ما ينتهي خلال
  60 يومًا يظهر "قريب" في القائمة، حتى لا تتعارض الصفحة مع اللوحة.
- المستوى `due0` معناه "ينتهي اليوم" (المستند صالح حتى نهاية يوم الانتهاء، ومنتهٍ من اليوم التالي).
- نضيف `due60` و`due0` إلى `SEVERITY` في `Vehicle.controller.js` و`LEVEL_TONE` في
  `VehicleAlerts.jsx` والنصوص.

### الأهمية في اللوحة

| المستوى | الأهمية |
| --- | --- |
| `due60` | معلومة |
| `due30`، `due14` | مهم |
| `due7`، `due0`، `expired` | حرج |
| `missing` | مهم |

### المهمة

- **`startVehicleExpiryJob`** في `server/utils/daily.js`: `cron.schedule("0 1 * * *", ...,
  { timezone: "Asia/Jerusalem" })`، تُستدعى من `server.js` بجانب `startDailyAbsenceJob`.
- **المنطق في دالة نقية `planVehicleNotices(alerts, existingKeys, today)`** (في ملف جديد
  `server/utils/vehicleNotices.js`، مختبر):
  - لكل تنبيه من `buildAlerts`، مفتاح فريد `dedupKey`:
    - `due*` و`missing`: `vehicle:<id>:<kind>:<level>:<dueDate|none>` (مرة واحدة لكل مرحلة).
    - `expired`: `vehicle:<id>:<kind>:expired:<dueDate>:w<رقم الأسبوع منذ الانتهاء>`،
      فيتكرر مرة كل 7 أيام.
  - يُعاد فقط ما لم يُنشأ من قبل. التجديد يغيّر `dueDate`، فتتوقف التذكيرات القديمة وحدها.
- **تاريخ انتهاء التأمين المنتهي:** `insuranceSummary` تعيد اليوم `endDate: null` للمنتهي، فلا
  يمكن عدّ الأسابيع. نضيف `endDate` لآخر بوليصة منتهية (أحدث `endDate`)، و`buildAlerts` تمرّره.
- **التشغيل (`runVehicleExpiryCheck({ now, trigger })`):**
  1. يقرأ كل المركبات غير المؤرشفة ويبني التنبيهات.
  2. يقرأ مفاتيح `dedupKey` الموجودة في `Notices` ويحسب الجديد عبر `planVehicleNotices`.
  3. ينشئ إعلانًا لكل تنبيه جديد (`category: "vehicle"`، رابط `/vehicles/<id>`).
  4. إذا وُجد جديد: رسالة بريد ملخّصة واحدة لكل مدير لديه بريد صالح. بلا `SMTP_SERVER` ⇒ تخطٍّ
     مع سجلّ، واللوحة تعمل.
  5. يحفظ آخر تشغيل في مجموعة `JobRuns` (`{ job: "vehicleExpiry", date, created, emailed, error }`).
- **تشغيل فائت:** عند بدء الخادم، إذا كانت الساعة بعد 01:00 ولا يوجد تشغيل بتاريخ اليوم ⇒ تشغيل فوري.
- **منع التشغيل المزدوج:** قفل في الذاكرة أثناء التشغيل. `api.js` لا ينشئ فهارس، لذلك يُنشأ فهرس
  فريد جزئي على `dedupKey` مرة واحدة عند بدء الخادم (`mongoose.connection.collection("Notices")
  .createIndex(..., { unique: true, partialFilterExpression: { dedupKey: { $type: "string" } } })`)،
  وخطأ التكرار (`E11000`) عند الإدراج يُعامل كـ"موجود" لا كفشل.
- **تشغيل يدوي:** `POST /api/notices/run-vehicle-check` (الإدارة فقط) يعيد `{ created, emailed }`.

## الجزء 3: لوحة إعلانات الإدارة

### التخزين

مجموعة `Notices` (عبر `api.js` مثل `Vehicle.model.js`):

```
title, body, category ("vehicle" | "system" | "manual"),
severity ("critical" | "important" | "info"), link, dedupKey (فريد، اختياري),
createdBy ("system" | userId), createdByName, createdAt,
readBy: [userId], archivedAt, archivedBy
```

### الخادم: `server/Entities/Notice/`

كل المسارات: `requireAuth` + الإدارة فقط.

| المسار | الوظيفة |
| --- | --- |
| `GET /api/notices?status=unread\|all&category=&severity=` | القائمة، الأحدث أولًا، بلا المؤرشف (حد 200) |
| `GET /api/notices/unread-count` | عدد غير المقروء للمستخدم |
| `POST /api/notices` | إعلان يدوي: `title` (1-120)، `body` (حتى 2000)، `severity` |
| `POST /api/notices/:id/read` | تعليم كمقروء |
| `POST /api/notices/read-all` | تعليم الكل كمقروء |
| `POST /api/notices/:id/archive` | أرشفة (أي مدير) |
| `POST /api/notices/run-vehicle-check` | تشغيل الفحص يدويًا |

- النص يُنظّف (`xss-clean` يعمل على كل الطلبات، والعميل يعرض نصًا لا HTML).
- `publishNotice({...})` دالة داخلية يستعملها الفحص الليلي ومستقبلًا أي جزء آخر ("رسائل النظام").

### العميل

- **جرس في `Header.jsx` (للإدارة فقط):** عدد غير المقروء، تحديث كل 60 ثانية وعند التركيز على
  النافذة. النقر يفتح `/notices`.
- **صفحة `/notices` (`client/src/Components/Notice/NoticesBoard.jsx`):** جدول (الأهمية، العنوان،
  الفئة، التاريخ، الكاتب، مقروء/غير مقروء) مع فلاتر، "تعليم الكل كمقروء"، أرشفة، نموذج إعلان جديد،
  وزر "تشغيل فحص المركبات الآن".
- **مسار في `Routes.jsx`** داخل المسارات المحمية، مع حماية للإدارة كما في الصفحات الإدارية.
- **النصوص:** ملف `client/src/i18n/noticeStrings.js` بالعربية والعبرية والإنجليزية.

## معالجة الأخطاء

- قراءة المستند: أي فشل ⇒ رسالة واضحة، والإدخال اليدوي يبقى متاحًا دائمًا.
- الفحص الليلي: خطأ في مركبة واحدة لا يوقف الباقي. خطأ عام يُسجّل في `JobRuns` و`logWithSource`،
  ويُنشأ إعلان `system` "فشل الفحص الليلي" (مع `dedupKey` باليوم).
- فشل البريد لمدير واحد لا يمنع الباقين ولا يلغي الإعلانات.

## الاختبارات

- **الخادم (`node --test`):**
  - `sanitizeExtraction`: تواريخ غير صالحة، لوحة غير مطابقة، نوع تأمين غير معروف، تواريخ معكوسة.
  - الخدمة مع عميل Claude مزيّف: بلا مفتاح، رد صالح، رد خطأ.
  - `expiryStatus` بالعتبات الجديدة (60 و0).
  - `planVehicleNotices`: مرة واحدة لكل مرحلة، تكرار أسبوعي بعد الانتهاء، التجديد يوقف التذكير.
  - صلاحيات `Notice`: غير المدير يحصل على 403.
- **العميل:** اختبار لعرض الاقتراح وتطبيقه في `DocumentScan`.

## خارج النطاق

- قراءة شهادة الفحص (الطست)، وإعدادات العتبات من الواجهة.
- إشعارات push أو WhatsApp.
- إصلاح صلاحيات `/api/events` (SSE).

## ما يحتاجه صاحب المشروع

- `ANTHROPIC_API_KEY` في `server/config/.env` (من console.anthropic.com).
- إعدادات `SMTP_*` صالحة للبريد، وبريد صحيح لكل مدير.
