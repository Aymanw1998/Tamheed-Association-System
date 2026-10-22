const nodemailer = require('nodemailer');

// ملاحظة عربية
const createTransporter = () => {
    try{
    return nodemailer.createTransport({
        host: process.env.SMTP_SERVER,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) == 465, // ملاحظة عربية
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
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

module.exports = {
    sendResetPasswordEmail,
    sendNoticeDigestEmail,
    sendSystemAdminEmail,
    smtpConfigured,
};
