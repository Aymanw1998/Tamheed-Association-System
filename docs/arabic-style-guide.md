# Arabic style guide

Tamheed is Arabic-only. All user-facing text is Modern Standard Arabic in a
clear administrative register: formal, short and friendly. Follow this guide
for every new label, toast, confirmation, tour step, email and server message.

## Terms

| Concept | Use | Avoid |
| --- | --- | --- |
| Student / students | طالب / الطلاب | متدرب |
| Guide | مرشد | مدرب |
| Assistant guide (role) | مساعد مرشد (in a lesson's staff: المساعد) | متدرب |
| Administration (role) | الإدارة / إدارة | ادارة (display), المدراء |
| Lesson | درس / الدروس | كورس، الكرس |
| Attendance | الحضور والغياب | حضور وغياب |
| Report / report author | تقرير / كاتب التقرير | صاحب التقرير |
| Vehicle / trailer | مركبة / مقطورة | سيارة (except in vehicle-insurance notes) |
| Periodic vehicle test | الفحص الدوري | التست |
| Vehicle documents | المستندات | الوثائق |
| Notice (posted on the notices board) | إعلان / لوحة الإعلانات | |
| Alert (automatic, personal, in the assistant) | تنبيه / التنبيهات | |
| Permission | صلاحية / الصلاحيات | |
| User / account | مستخدم / حساب | |
| Role | الدور | |
| Parents | الأهل (رابط تسجيل الأهل) | ولي الأمر, الأب/الأم only for the fields |
| Password | كلمة المرور | كلمة السر |
| Verification code | رمز التحقق | الكود، رقم التحقق |
| ID number | رقم الهوية | رقم التعريف |
| Email | البريد الإلكتروني | بريد الكتروني |
| Filter | التصفية | الفلاتر، فلترة |
| Download / upload | تنزيل / رفع | تحميل (for files) |
| Loading | جارٍ التحميل… | جاري، جار |
| Active / waiting / stopped (users) | فعّال / بانتظار الموافقة / موقوف | مسجل، مُنتظرين، مُعطل |
| Active / waiting / inactive (students) | فعّال / بانتظار الموافقة / غير فعّال | |
| Vehicle status | نشطة / خارج الخدمة / مؤرشفة | |
| Block / unblock an account | حظر / رفع الحظر | قفل، فك الحظر |
| Stop an account | إيقاف الحساب | غلق الحساب |
| Severity | عاجل / مهم / معلومة | حرج، للعلم |

Buttons: حفظ، حفظ التعديلات، إلغاء، حذف، تعديل، إضافة، تأكيد، فتح، رجوع،
العودة إلى القائمة، قبول، رفض، تحديث القائمة.

Days: الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة، السبت.

## Tone and spelling

- Address the user in the singular imperative: «اختر»، «احفظ»، «حاول مرة أخرى».
  Public pages for parents use the impersonal «يُرجى …» instead of plural verbs.
- Write hamza, taa marbuta and alif maqsura correctly: إضافة، إرسال، أنثى،
  أولًا، الإلكتروني، مسجّل. Put tanween on the letter before the alif: حاليًا، أولًا.
- Use Arabic punctuation: «،» «؛» «؟». Use «…» (one character) and «» for quoted names.
- Prefer «تعذّر …» to «فشل/لم يتم …», and «توجد/لا توجد» with feminine plurals.
- No emoji in toasts or messages; the toast already shows an icon.
- Keep strings short. Do not translate brand names (Google Drive, PDF, data.gov.il).
- Avoid number-noun agreement problems with a label and a colon:
  «الإعلانات الجديدة: {n}» rather than «{n} إعلانات جديدة».
- Data values stored in the database (roles «ادارة/مرشد/مساعد», attendance
  «حاضر/غائب/متأخر», student status «عادي/ينتظر», source «اهل/جمعية», gender
  «ذكر/انثى») are never renamed; change only the label shown for them.

## Patterns

| Situation | Pattern | Example |
| --- | --- | --- |
| Success toast | تم/تمت + المصدر + بنجاح | تم حفظ الطالب بنجاح / تمت إضافة الدرس بنجاح |
| Error toast | تعذّر + المصدر | تعذّر حذف الملف |
| Generic error | تعذّر إتمام العملية. / حدث خطأ غير متوقع، حاول مرة أخرى. | |
| Required field | هذا الحقل مطلوب / يُرجى تعبئة الحقول المطلوبة | |
| Confirmation title | تأكيد + المصدر | تأكيد الحذف |
| Confirmation body | هل تريد + الفعل + …؟ | هل تريد حذف «تقرير الأسبوع»؟ لا يمكن التراجع عن هذا الإجراء. |
| Warning before a risky change | الأثر، ثم «هل تريد المتابعة؟» | خفض الدور يلغي كل الصلاحيات الخاصة… هل تريد المتابعة؟ |
| Empty state | لا توجد/لا يوجد + المصدر | لا توجد إعلانات |
| Session expired | انتهت الجلسة. يُرجى تسجيل الدخول مرة أخرى. | |
| Count summary | المصدر: {n} | عدد التقارير: 12 |
