import React, { useEffect, useRef, useState } from 'react'
import styles from "./LoginPage.module.css"

//LogoIMG
import LogoIMG from "./../../../images/logo.png"
import { useLocation, useNavigate } from 'react-router-dom'

import { login } from '../../../WebServer/services/auth/fuctionsAuth';
import { toast } from '../../../ALERT/SystemToasts';
import ForgotPassword from '../ForgotPassword/ForgotPassword';
import EyeIcon from '../../UI/EyeIcon';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();

    const [showPopup, setShowPopup] = useState(false);
    const [tz, setTz] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading,  setLoading]  = useState(false);

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
            toast.warn("الرجاء ملء جميع الحقول.");
            return;
        }
        setLoading(true);
        try {
            const me = await login(tz, password);
            if (me?.firstname || me?.lastname) {
                toast.success(`${[me.firstname, me.lastname].filter(Boolean).join(' ')}, مرحباً بك في النظام!`);
            }

            const from = location.state?.from?.pathname || '/dashboard';
            navigate(from, { replace: true });
        } catch (err) {
            console.error('Login error:', err?.response?.data || err.message);
            toast.error(err?.response?.data?.message || err.message || 'فشل تسجيل الدخول. الرجاء المحاولة مرة أخرى.');
        } finally {
        setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.leftPanel}>
                <div className={styles.welcomeText}>
                <img src={LogoIMG} alt="جمعية تمهيد" />
                </div>
            </div>
            <div className={styles.rightPanel}>
                <div className={styles.loginForm}>
                    <div className={`${styles.logo} ${styles.logoDisNone}`}><img src={LogoIMG}/></div>
                    <h2>سجل الدخول</h2>

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
                    <button type="submit" onClick={handleLogin} disabled={loading}>{loading ? '...' : 'أدخل'}</button>
                    <hr />
                    <button type="button" className={styles.secondaryButton} onClick={()=>navigate("/register")}>{'تسجل كمستخدم'}</button>
                </div>
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
