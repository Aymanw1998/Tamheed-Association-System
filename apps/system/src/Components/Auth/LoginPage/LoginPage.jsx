import RequiredMark from "../../UI/RequiredMark";
import { newSignIn, passkeySupported } from "../../../utils/passkey";
import React, { useEffect, useRef, useState } from 'react'
import styles from "./LoginPage.module.css"

//LogoIMG
import LogoIMG from "./../../../images/logo.png"
import { useLocation, useNavigate } from 'react-router-dom'

import { login, loginWithPass, loginWithCode, loginWithPasskey } from '../../../WebServer/services/auth/fuctionsAuth';
import { toast } from '../../../ALERT/SystemToasts';
import ForgotPassword from '../ForgotPassword/ForgotPassword';
import EyeIcon from '../../UI/EyeIcon';
import ForcedPasswordChange from '../ForcedPasswordChange/ForcedPasswordChange';
import { useI18n } from '../../../i18n/I18nContext';
import { InstallAppButton } from '../../../pwa/InstallApp';
import { takePassFromAddress } from '../../../utils/siteLink';

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();

    const [showPopup, setShowPopup] = useState(false);
    const [tz, setTz] = useState('');
    const [password, setPassword] = useState('');
    // The ID number waiting for its email code, and the code typed.
    const [canPasskey] = useState(passkeySupported);
    // This page shows only when signed out: what follows is a new sign-in.
    useEffect(() => { newSignIn(); }, []);
    const [codeFor, setCodeFor] = useState(null);
    const [codeTicket, setCodeTicket] = useState('');
    const [code, setCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading,  setLoading]  = useState(false);
    // Set when the login answered mustChangePassword: { token, currentPassword }.
    // Held in memory only; until the change succeeds only that form is shown.
    const [forced, setForced] = useState(null);
    const { t } = useI18n();

    // The IT site's «النظام» button opens this page with #pass=<pass>: the
    // fragment is removed from the address at once and the pass replaces the
    // password step. Once per page load (a re-render must not spend it twice).
    const passTried = useRef(false);
    useEffect(() => {
        if (passTried.current) return;
        passTried.current = true;
        const pass = takePassFromAddress();
        if (!pass) return;
        (async () => {
            setLoading(true);
            try {
                const me = await loginWithPass(pass);
                if (me?.mustChangePassword) {
                    toast.warn("سجّل الدخول بكلمة المرور لتغييرها.");
                    return;
                }
                finishLogin(me);
            } catch (err) {
                toast.error(err?.response?.data?.message || err.message || "تعذّر تسجيل الدخول. يُرجى المحاولة مرة أخرى.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

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
            if (me?.codeRequired) {
                setCodeFor(me.tz);
                setCodeTicket(me.ticket);
                return;
            }
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

    const handlePasskey = async () => {
        setLoading(true);
        try {
            const r = await loginWithPasskey();
            if (r.mustChangePassword) {
                toast.warn("يجب تغيير كلمة المرور أولًا. ادخل برقم الهوية وكلمة المرور.");
                return undefined;
            }
            if (r.ok) return finishLogin(r.user);
            if (!r.cancelled) toast.error(r.message || "تعذّر الدخول بالبصمة. ادخل بكلمة المرور.");
        } finally {
            setLoading(false);
        }
        return undefined;
    };

    const handleCode = async () => {
        if (!code.trim()) {
            toast.warn("يُرجى إدخال الرمز.");
            return;
        }
        setLoading(true);
        try {
            finishLogin(await loginWithCode(codeFor, code.trim(), codeTicket));
        } catch (err) {
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
            const me = await login(tz, newPassword);
            if (me?.codeRequired) {
                setCodeFor(me.tz);
                setCodeTicket(me.ticket);
                return;
            }
            finishLogin(me);
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
                ) : codeFor ? (
                <div className={styles.loginForm}>
                    <h2>رمز الدخول</h2>
                    <p>أرسلنا رمزًا إلى بريدك الإلكتروني. الرمز صالح لمدة 10 دقائق.</p>
                    <label className={styles.fieldLabel} htmlFor="login-code">الرمز<RequiredMark /></label>
                    <input
                        id="login-code"
                        name="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCode(); }}
                        autoFocus
                    />
                    <button type="submit" onClick={handleCode} disabled={loading}>{loading ? '…' : 'تأكيد'}</button>
                    <button type="button" className={styles.secondaryButton} onClick={() => { setCodeFor(null); setCode(''); }}>رجوع</button>
                </div>
                ) : (
                <div className={styles.loginForm}>
                    <div className={`${styles.logo} ${styles.logoDisNone}`}><img src={LogoIMG}/></div>
                    <h2>تسجيل الدخول</h2>

                    <label className={styles.fieldLabel} htmlFor="login-tz">رقم الهوية أو البريد الإلكتروني<RequiredMark /></label>
                    <input id="login-tz" ref={tzRef} name="tz" type="text" placeholder="رقم الهوية أو البريد الإلكتروني" value={tz} onChange={(e)=>setTz(e.target.value)} onKeyDown={handleKeyDown} required />

                    <label className={styles.fieldLabel} htmlFor="login-password">كلمة المرور<RequiredMark /></label>
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

                    {canPasskey && (
                        <button type="button" className={styles.secondaryButton} onClick={handlePasskey} disabled={loading}>الدخول بالبصمة أو بالوجه</button>
                    )}
                    <button type="button" className={styles.forgotLink} onClick={() => setShowPopup(true)}>نسيت كلمة المرور؟</button>
                    <button type="submit" onClick={handleLogin} disabled={loading}>{loading ? '…' : 'دخول'}</button>
                    <hr />
                    <button type="button" className={styles.secondaryButton} onClick={()=>navigate("/register")}>{'التسجيل كمستخدم جديد'}</button>
                    {/* Phones only, until the app is installed. */}
                    <InstallAppButton className={styles.secondaryButton} />
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
