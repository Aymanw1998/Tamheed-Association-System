const nodemailer = require('nodemailer');

// יצירת טרנספורטר עם פרטי ה-SMTP
const createTransporter = () => {
    try{
    return nodemailer.createTransport({
        host: process.env.SMTP_SERVER,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) == 465, // true עבור פורט 465, false עבור אחרים
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
                    <h2>اعادة تعيين كلمة السر</h2>
                    <p>الكود هو: </p>
                    <div style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</div>
                    <p>الكود لحديد 10 دقائق من الان.</p>
                </div>`;
    await transporter.sendMail({
        from: process.env.SMTP_FROM, // למשל: "Tamheed-Ramla <no-reply@tamheed-ramla.org>"
        to,
        subject: "اعادة تعيين كلمة السر: " + otp,
        html,
    });
}
module.exports = {
    sendResetPasswordEmail,
};