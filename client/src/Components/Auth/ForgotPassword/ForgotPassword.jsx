import React, { useState } from "react";
import { forgotPassword, resetPassword } from "../../../WebServer/services/auth/fuctionsAuth.jsx";

export default function ForgotPassword() {
    const [step, setStep] = useState(1); // 1: request reset, 2: enter OTP and new password
    const [tz, setTz] = useState("");
    const [msg, setMsg] = useState("");
    const [loading, setLoading] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        setMsg("");

        if (!tz.trim()) return setMsg("الرجاء إدخال رقم الهوية.");

        try {
            setLoading(true);
            const res = await forgotPassword(tz.trim());
            alert(2);
            setMsg(res?.message || "سوف يتم إرسال رابط إعادة التعيين إذا كان المستخدم موجودًا.");
            alert(2);
            setStep(2);
        } catch (err) {
            setMsg("حدث خطأ أثناء معالجة طلبك. الرجاء المحاولة مرة أخرى.");
        } finally {
            setLoading(false);
        }
    };

    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const handleResetPassword = async () => {
        setMsg("");
        if (!otp.trim() || otp.trim().length !== 6) return setMsg("الرجاء إدخال رمز التحقق الصحيح (6 أرقام).");
        if (!newPassword) return setMsg("الرجاء إدخال كلمة السر الجديدة.");
        if (newPassword !== confirmPassword) return setMsg("كلمتا السر غير متطابقتين.");
        try {
            setLoading(true);
            const res = await resetPassword(tz.trim(), otp.trim(), newPassword, confirmPassword);
            if (res.ok) {
                setMsg("تمت إعادة تعيين كلمة السر بنجاح. يمكنك الآن تسجيل الدخول.");
                setStep(1);
                setTz("");
                setOtp("");
                setNewPassword("");
                setConfirmPassword("");
            }
            else {
                setMsg(res.message || "فشل في إعادة تعيين كلمة السر. الرجاء المحاولة مرة أخرى.");
            }
        } catch (err) {
            setMsg("حدث خطأ أثناء معالجة طلبك. الرجاء المحاولة مرة أخرى.");
        }
        finally {
            setLoading(false);
        }
    }
        return (
            <>
            {step == 1 && 
                <> 
                <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
                    <p>ادخل رقم الهوية لنرسل رابط لإعادة تعيين كلمة السر </p>
                    <form onSubmit={onSubmit}>
                        <label>رقم الهوية</label>
                        <input
                            type="tz"
                            value={tz}
                            onChange={(e) => setTz(e.target.value)}
                            placeholder="209138155"
                            style={{ width: "100%", padding: 10, margin: "8px 0 12px" }}
                        />
                        <button disabled={loading} style={{ width: "100%", padding: 10 }}>
                        {loading ? "يرسل..." : "ارسل رابط إعادة التعيين"}
                        </button>
                    </form>
                    {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
                </div>
            </>
            }
            {step == 2 && (
                <div>
                    <h2>ادخال المعلومات</h2>
                    <h3>رقم الهوية {tz}</h3>

                    <label>رقم التحقق</label>
                    <input
                        type="otp"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="יدخل رقم التحقق (6 أرقام)"
                        style={{ width: "100%", padding: 10, margin: "8px 0 12px" }}
                    />
                    <label>كلمة السر الجديدة</label>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="يكتب كلمة السر الجديدة"
                        style={{ width: "100%", padding: 10, margin: "8px 0 12px" }}
                    />
                    <label>تأكيد كلمة السر الجديدة</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="يؤكد كلمة السر الجديدة"
                        style={{ width: "100%", padding: 10, margin: "8px 0 12px" }}
                    />
                    <button disabled={loading} style={{ width: "100%", padding: 10 }} onClick={handleResetPassword}>
                        {loading ? "يعالج..." : "إعادة تعيين كلمة السر"}
                    </button>
                </div>
        )}
        </>
    );
}