const nodemailer = require('nodemailer');

// ملاحظة عربية
const createTransporter = (options = {}) => {
    try{
    return nodemailer.createTransport({
        host: process.env.SMTP_SERVER,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) == 465, // ملاحظة عربية
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        ...options,
    });
    }catch(err){
        console.error("Error creating SMTP transporter:", err);
        throw err;
    }
}

const sendResetPasswordEmail = async (to, otp) => {
    const transporter = createTransporter();
    const html = `<div style="font-family:Arial;line-height:1.6;align:center;">
                    <h2>إعادة تعيين كلمة المرور</h2>
                    <p>رمز التحقق الخاص بك:</p>
                    <div style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</div>
                    <p>الرمز صالح لمدة 10 دقائق من وقت الإرسال. إذا لم تطلب إعادة تعيين كلمة المرور، فتجاهل هذه الرسالة.</p>
                </div>`;
    await transporter.sendMail({
        from: process.env.SMTP_FROM, // ملاحظة عربية
        to,
        subject: "رمز إعادة تعيين كلمة المرور: " + otp,
        html,
    });
}
const sendSportLoginCodeEmail = async (to, code) => {
    const transporter = createTransporter();
    const html = `<div style="font-family:Arial;line-height:1.6;align:center;">
                    <h2>الدخول إلى تمهيد - رياضة</h2>
                    <p>رمز الدخول الخاص بك:</p>
                    <div style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</div>
                    <p>الرمز صالح لمدة 10 دقائق من وقت الإرسال. إذا لم تطلب الدخول، فتجاهل هذه الرسالة.</p>
                </div>`;
    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: "رمز الدخول إلى تمهيد - رياضة: " + code,
        html,
    });
}
// The IT site's sign-in code (Entities/It/It.auth.js).
const sendItLoginCodeEmail = async (to, code) => {
    const transporter = createTransporter();
    const html = `<div dir="rtl" style="font-family:Arial;line-height:1.6;">
                    <h2>الدخول إلى تمهيد - قسم IT</h2>
                    <p>رمز الدخول الخاص بك:</p>
                    <div style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</div>
                    <p>الرمز صالح لمدة 10 دقائق ولمرة واحدة. إذا لم تحاول الدخول، فغيّر كلمة المرور فورًا.</p>
                </div>`;
    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: "رمز الدخول إلى تمهيد - قسم IT",
        html,
    });
}
// System's sign-in code (Entities/User/SystemCode.auth.js).
const sendSystemLoginCodeEmail = async (to, code) => {
    const transporter = createTransporter();
    const html = `<div dir="rtl" style="font-family:Arial;line-height:1.6;">
                    <h2>الدخول إلى نظام تمهيد</h2>
                    <p>رمز الدخول الخاص بك:</p>
                    <div style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</div>
                    <p>الرمز صالح لمدة 10 دقائق ولمرة واحدة. إذا لم تحاول الدخول، فغيّر كلمة المرور فورًا.</p>
                </div>`;
    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: "رمز الدخول إلى نظام تمهيد",
        html,
    });
}
const smtpConfigured = () => Boolean(process.env.SMTP_SERVER && process.env.SMTP_PORT && process.env.SMTP_FROM);

const sendNoticeDigestEmail = async (to, { subject, html, text }) => {
    const transporter = createTransporter();
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html, text });
};

// The system account's mailbox (SYSTEM_ADMIN_EMAIL): temporary passwords and
// failed sign-in alerts. Callers never log the message body.
const sendSystemAdminEmail = async (to, { subject, html, text }) => {
    const transporter = createTransporter();
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html, text });
};

// A new account's first sign-in details (an IT user created on the IT site).
// Callers never log the message body.
const sendAccountEmail = async (to, { subject, html, text }) => {
    const transporter = createTransporter();
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html, text });
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BUG_TYPES = { fault: "عطل", suggestion: "اقتراح تحسين", problem: "مشكلة ملموسة" };

// To one IT mailbox. The picture stays on the IT site, where deleting removes it.
const sendBugReportEmail = async (to, report) => {
    const row = (label, value) => (value ? `<tr><th style="text-align:right;padding:4px 12px">${escapeHtml(label)}</th><td dir="auto" style="padding:4px 12px">${escapeHtml(value)}</td></tr>` : "");
    const type = BUG_TYPES[report.type] || report.type;
    const error = [report.errorStatus || "", report.errorCode, report.errorMessage].filter(Boolean).join(" ");
    const html = `<div dir="rtl" style="font-family:Arial;line-height:1.6">
                    <h2>بلاغ جديد: ${escapeHtml(type)}</h2>
                    <table>
                    ${row("من أبلغ", [report.reporterName, report.reporterRole].filter(Boolean).join(" - "))}
                    ${row("القسم", report.section)}
                    ${row("الصفحة", report.page)}
                    ${row("الإجراء", report.action)}
                    ${row("خطأ الخادم", error)}
                    ${row("مصدر الخطأ", report.errorSource)}
                    ${row("رقم الطلب", report.requestId)}
                    ${row("الوصف", report.text)}
                    ${row("الجهاز", report.device)}
                    ${report.hasImage ? row("صورة", "مرفقة في قسم IT") : ""}
                    </table>
                    <p>يمكنك متابعته في قسم IT، صفحة «البلاغات».</p>
                </div>`;
    await createTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: `بلاغ جديد: ${type}${report.section ? ` - ${report.section}` : ""}`,
        html,
    });
};

module.exports = {
    // Plain text preserves management's wording without interpreting HTML.
    sendWeeklyTaskEmail: async (to, text) => {
        if (!smtpConfigured()) throw new Error("SMTP is not configured");
        await createTransporter({ connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 }).sendMail({ from: process.env.SMTP_FROM, to, subject: "تمهيد — المهمات الأسبوعية", text });
    },
    sendBugReportEmail,
    sendAccountEmail,
    sendResetPasswordEmail,
    sendSportLoginCodeEmail,
    sendItLoginCodeEmail,
    sendSystemLoginCodeEmail,
    sendNoticeDigestEmail,
    sendSystemAdminEmail,
    smtpConfigured,
};
