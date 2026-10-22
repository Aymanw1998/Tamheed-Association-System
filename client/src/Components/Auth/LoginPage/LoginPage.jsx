import React, { useEffect, useRef, useState } from 'react'
import styles from "./LoginPage.module.css"

//LogoIMG
import LogoIMG from "./../../../images/logo.png"
import { useLocation, useNavigate } from 'react-router-dom'

import { login } from '../../../WebServer/services/auth/fuctionsAuth';
import { toast } from '../../../ALERT/SystemToasts';
import ForgotPassword from '../ForgotPassword/ForgotPassword';
import EyeIcon from '../../UI/EyeIcon';
import ForcedPasswordChange from '../ForcedPasswordChange/ForcedPasswordChange';
import { useI18n } from '../../../i18n/I18nContext';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();

    const [showPopup, setShowPopup] = useState(false);
    const [tz, setTz] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading,  setLoading]  = useState(false);
    // Set when the login answered mustChangePassword: { token, currentPassword }.
    // Held in memory only; until the change succeeds only that form is shown.
    const [forced, setForced] = useState(null);
    const { t } = useI18n();

    const tzRef = useRef(null);
    const passwordRef = useRef(null);

    const handleKeyDown = (e) => {
        if(e.target.name == "tz" && e.key == "Enter") {
            passwordRef.current.focus();
        }
        else if(e.target.name == "password" && e.key == "Enter"){
            handleLogin();
        }
    }
    const handleLogin = async(e)=> {
        if(tz == "" || password == ""){
            toast.warn("يُرجى تعبئة جميع الحقول.");
            return;
        }
        setLoading(true);
        try {
            const me = await login(tz, password);
            if (me?.mustChangePassword) {
                setForced({ token: me.accessToken, currentPassword: password });
                return;
            }
            finishLogin(me);
        } catch (err) {
            console.error('Login error:', err?.response?.data || err.message);
            toast.error(err?.response?.data?.message || err.message || 'تعذّر تسجيل الدخول. يُرجى المحاولة مرة أخرى.');
        } finally {
        setLoading(false);
        }
    };

    function finishLogin(me) {
        if (me?.firstname || me?.lastname) {
            toast.success(`مرحبًا بك، ${[me.firstname, me.lastname].filter(Boolean).join(' ')}`);
        }
        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
    }

    // After the forced change, sign in normally with the new password.
    const afterForcedChange = async (newPassword) => {
        toast.success(t('passwordChange.success'));
        setForced(null);
        setPassword('');
        try {
            finishLogin(await login(tz, newPassword));
        } catch (err) {
            // The password did change; the user can sign in with it by hand.
            toast.error(err?.response?.data?.message || err.message || 'تعذّر تسجيل الدخول. يُرجى المحاولة مرة أخرى.');
        }
    };

    const cancelForcedChange = () => {
        setForced(null);
        setPassword('');
    };

    return (
        <div className={styles.container}>
            <div className={styles.leftPanel}>
                <div className={styles.welcomeText}>
                <img src={LogoIMG} alt="جمعية تمهيد" />
                </div>
            </div>
            <div className={styles.rightPanel}>
                {forced ? (
                    <ForcedPasswordChange
                        token={forced.token}
                        currentPassword={forced.currentPassword}
                        onChanged={afterForcedChange}
                        onCancel={cancelForcedChange}
                    />
                ) : (
                <div className={styles.loginForm}>
                    <div className={`${styles.logo} ${styles.logoDisNone}`}><img src={LogoIMG}/></div>
                    <h2>تسجيل الدخول</h2>

                    <label className={styles.fieldLabel} htmlFor="login-tz">رقم الهوية أو البريد الإلكتروني</label>
                    <input id="login-tz" ref={tzRef} name="tz" type="text" placeholder="رقم الهوية أو البريد الإلكتروني" value={tz} onChange={(e)=>setTz(e.target.value)} onKeyDown={handleKeyDown} required />

                    <label className={styles.fieldLabel} htmlFor="login-password">كلمة المرور</label>
                    <div className={styles.passwordWrapper}>
                        <input
                            id="login-password"
                            ref={passwordRef}
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="كلمة المرور"
                            value={password}
                            onChange={(e)=>setPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            required
                        />
                        <button
                            type="button"
                            className={styles.togglePassword}
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                            aria-pressed={showPassword}
                        >
                            <EyeIcon open={showPassword} />
                        </button>
                    </div>

                    <button type="button" className={styles.forgotLink} onClick={() => setShowPopup(true)}>نسيت كلمة المرور؟</button>
                    <button type="submit" onClick={handleLogin} disabled={loading}>{loading ? '…' : 'دخول'}</button>
                    <hr />
                    <button type="button" className={styles.secondaryButton} onClick={()=>navigate("/register")}>{'التسجيل كمستخدم جديد'}</button>
                </div>
                )}
            </div>

            {showPopup && (
                    <div className={styles.popupOverlay} onClick={() => setShowPopup(false)}>
                    <div className={styles.popup} dir="rtl" onClick={(e) => e.stopPropagation()}>
                        <ForgotPassword />
                        <button className={styles.closeButton} onClick={() => setShowPopup(false)}>إغلاق</button>
                    </div>
                    </div>
            )}
        </div>
    )
}
