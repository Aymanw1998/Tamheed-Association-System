import React, { useState } from "react";
import { forgotPassword, resetPassword } from "../../../WebServer/services/auth/fuctionsAuth.jsx";
import styles from "./ForgotPassword.module.css";
import Button from "../../UI/Button";
import EyeIcon from "../../UI/EyeIcon";
import { resetPasswordError } from "../../../utils/passwordChange";
import { useI18n } from "../../../i18n/I18nContext";

export default function ForgotPassword() {
    const { t } = useI18n();
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
            setMsg(res?.message || "سوف يتم إرسال رابط إعادة التعيين إذا كان المستخدم موجودًا.");
            // A refusal (for example a locked account) keeps the user on this step.
            if (res?.ok !== false) setStep(2);
        } catch (err) {
            setMsg("حدث خطأ أثناء معالجة طلبك. الرجاء المحاولة مرة أخرى.");
        } finally {
            setLoading(false);
        }
    };

    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleResetPassword = async () => {
        setMsg("");
        if (!otp.trim() || otp.trim().length !== 6) return setMsg("الرجاء إدخال رمز التحقق الصحيح (6 أرقام).");
        // Same 8-128 rule as the server (and the forced change), checked before sending.
        const problem = resetPasswordError({ newPassword, confirmPassword });
        if (problem) return setMsg(t(`passwordChange.errors.${problem}`, t("passwordChange.errors.generic")));
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
        <div className={styles.wrapper}>
            {step === 1 && (
                <>
                    <p className={styles.intro}>ادخل رقم الهوية لنرسل رابط لإعادة تعيين كلمة السر</p>
                    <form className={styles.wrapper} onSubmit={onSubmit}>
                        <div className={styles.field}>
                            <label htmlFor="fp-tz">رقم الهوية</label>
                            <input
                                id="fp-tz"
                                type="text"
                                inputMode="numeric"
                                value={tz}
                                onChange={(e) => setTz(e.target.value)}
                                placeholder="209138155"
                            />
                        </div>
                        <Button type="submit" className={styles.submit} loading={loading}>
                            ارسل رابط إعادة التعيين
                        </Button>
                    </form>
                    {msg && <p className={styles.message}>{msg}</p>}
                </>
            )}
            {step === 2 && (
                <div className={styles.wrapper}>
                    <h3 className={styles.tzReminder}>رقم الهوية: <strong>{tz}</strong></h3>

                    <div className={styles.field}>
                        <label htmlFor="fp-otp">رقم التحقق</label>
                        <input
                            id="fp-otp"
                            type="text"
                            inputMode="numeric"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            placeholder="أدخل رقم التحقق (6 أرقام)"
                        />
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="fp-new-password">كلمة السر الجديدة</label>
                        <div className={styles.passwordWrapper}>
                            <input
                                id="fp-new-password"
                                type={showNewPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="يكتب كلمة السر الجديدة"
                                aria-describedby="fp-password-hint"
                            />
                            <button
                                type="button"
                                className={styles.togglePassword}
                                onClick={() => setShowNewPassword((v) => !v)}
                                aria-label={showNewPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                                aria-pressed={showNewPassword}
                            >
                                <EyeIcon open={showNewPassword} />
                            </button>
                        </div>
                    </div>

                    <p id="fp-password-hint" className={styles.hint}>{t("passwordChange.resetHint")}</p>

                    <div className={styles.field}>
                        <label htmlFor="fp-confirm-password">تأكيد كلمة السر الجديدة</label>
                        <div className={styles.passwordWrapper}>
                            <input
                                id="fp-confirm-password"
                                type={showConfirmPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="يؤكد كلمة السر الجديدة"
                            />
                            <button
                                type="button"
                                className={styles.togglePassword}
                                onClick={() => setShowConfirmPassword((v) => !v)}
                                aria-label={showConfirmPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                                aria-pressed={showConfirmPassword}
                            >
                                <EyeIcon open={showConfirmPassword} />
                            </button>
                        </div>
                    </div>

                    <Button type="button" className={styles.submit} loading={loading} onClick={handleResetPassword}>
                        إعادة تعيين كلمة السر
                    </Button>

                    {msg && <p className={styles.message}>{msg}</p>}
                </div>
            )}
        </div>
    );
}
