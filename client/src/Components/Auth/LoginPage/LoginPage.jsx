import React, { useEffect, useRef, useState } from 'react'
import "./LoginPage.css"

//LogoIMG
import LogoIMG from "./../../../images/logo.png"
import { useNavigate } from 'react-router-dom'

import {login} from "../../services/auth/fuctionsAuth"
const infoSystem = {
    username: process.env.REACT_APP_USERNAME_SYSTEM,
    password: process.env.REACT_APP_PASSWORD_SYSTEM,
}
export default function LoginPage() {

    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const usernameRef = useRef(null);
    const passwordRef = useRef(null);

    const handleKeyDown = (e) => {
        console.log(e.target.name, e.key);
        if(e.target.name == "username" && e.key == "Enter") {
            passwordRef.current.focus();
        }
        else if(e.target.name == "password" && e.key == "Enter"){
            handleLogin();
        }
    }
    const handleLogin = async(e)=> {
        if(username == "" || password == ""){
            alert("يوجد معلومات ناقصة");
            return;
        }
        console.log("login system", infoSystem);
        console.log("login me", {username: username, password: password})
        try{
            const res = await login(username, password);
            const {accessToken, expirationTime, user, message, status} = res;
            console.log("status", res. status);
            console.log("res login", status == 200 ? {accessToken, expirationTime, user}: {message});
            if (status === 200 && username.toLowerCase() === user.username.toLowerCase() && password === user.password) {
                //e.preventDefault(); // Prevent actual form submission
                // Save token and expiry in localStorage
                console.log(user.tz);
                localStorage.setItem('authToken', accessToken);
                localStorage.setItem('user', user.tz);
                localStorage.setItem('tokenExpiry', expirationTime);
                alert('تم الدخول بنجاح! ستظل معلوماتك محفوظة لمدة 24 ساعة');
                navigate("/dashboard/get")
                window.location.reload(); // רענון הדף
            }
            else alert("اسم المستخدم او كلمة المرور ليست صحيحة");
        } catch(err) {console.error("Login error: ", err.response?.data || err.message); alert(err.response?.data.message || err.message)}
    }
    return (
        <div className="container">
            <div className="left-panel">
                <div className="logo"><img src={LogoIMG} alt="جمعية تمهيد" /></div>
                <div className="welcome-text">
                    <h2>اهلا بك<br/><span>جمعية تمهيد</span><br/><strong>الرملة</strong></h2>
                </div>
            </div>
            <div className="right-panel">
                <div className="login-form">
                    <div className="logo logo-login"><img src={LogoIMG} alt="جمعية تمهيد" /></div>
                    <h2>تسجيل الدخول</h2>
                    <input ref={usernameRef} name="username" type="text" placeholder="اسم المستخدم" value={username} onChange={(e)=>setUsername(e.target.value)} onKeyDown={handleKeyDown} required />
                    <input ref={passwordRef} name="password" type="password" placeholder="كلمة المرور" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={handleKeyDown} required />
                    <a href="#" className="forgot">نسيت كلمة السر؟</a>
                    <button type="submit" onClick={handleLogin}>دخول</button>
                    {/* <p className="create-account">Don't have any account? <a href="#">Create an account</a></p> */}
                </div>
            </div>
        </div>
    )
}
