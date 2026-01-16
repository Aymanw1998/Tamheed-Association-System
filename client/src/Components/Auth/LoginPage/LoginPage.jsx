import React, { useEffect, useRef, useState } from 'react'
import styles from "./LoginPage.module.css"

//LogoIMG
import LogoIMG from "./../../../images/logo.png"
import { useLocation, useNavigate } from 'react-router-dom'

import { login, getMe } from '../../../WebServer/services/auth/fuctionsAuth';
import { toast } from '../../../ALERT/SystemToasts';
import ForgotPassword from '../ForgotPassword/ForgotPassword';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();

    const [showPopup, setShowPopup] = useState(false);
    const [tz, setTz] = useState('');
    const [password, setPassword] = useState('');
    const [loading,  setLoading]  = useState(false);

    const tzRef = useRef(null);
    const passwordRef = useRef(null);
    
    const handleKeyDown = (e) => {
        console.log(e.target.name, e.key);
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
            // login: שומר accessToken + isLoggedIn + role (לפי ה-services שלנו)
            const me = await login(tz, password);
            // הודעת ברוך הבא (אופציונלי)
            if (me?.firstname || me?.lastname) {
                toast.success(`${[me.firstname, me.lastname].filter(Boolean).join(' ')}, مرحباً بك في النظام!`);
            }

            // נווט חזרה לנתיב המבוקש או לדאשבורד
            const from = location.state?.from?.pathname || '/calendar';
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
            <div className={styles.leftPanel} style={{backgroundColor: "#9BBFB6"}}>
                <div className={styles.welcomeText}>
                <img src={LogoIMG} alt="جمعية تمهيد" />
                </div>
            </div>
            <div className={styles.rightPanel}>
                <div className={styles.loginForm}>
                    <div className={`${styles.logo} ${styles.logoDisNone}`}><img src={LogoIMG}/></div>
                    <h2>سجل الدخول</h2>
                    <input ref={tzRef} name="tz" type="text" placeholder="رقم الهوية" value={tz} onChange={(e)=>setTz(e.target.value)} onKeyDown={handleKeyDown} required />
                    <input ref={passwordRef} name="password" type="password" placeholder="كلمة المرور" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={handleKeyDown} required />
                    <a href="#" onClick={(e)=>{e.preventDefault(); setShowPopup(true);}}>نسيت كلمة المرور؟</a>
                    <button type="submit" style={{backgroundColor: "#88f388ff", color: "#000"}} onClick={handleLogin}>{loading ? '...' : 'أدخل'}</button>
                    <hr />
                    <button type="submit" style={{backgroundColor: "#4cfdfdff", color: "#000"}} onClick={()=>navigate("/register")}>{'تسجل كمستخدم'}</button>
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
