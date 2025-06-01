import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Header.css"
import LOGO from "../../images/logo.png"
export default function Header() {
    const [role, setRole] = useState(localStorage.getItem('role'));
    const navigate = useNavigate();
    useEffect(() => {
        const token = localStorage.getItem("authToken");
        const expiry = localStorage.getItem("tokenExpiry");

        if (((token && expiry && Date.now() > Number(expiry)) || (!token && !expiry)) && window.location.pathname !== "/") {
            localStorage.removeItem("authToken");
            localStorage.removeItem("tokenExpiry");
            setTimeout(() => { alert("لم يعد لديك صلاحية للدخول");navigate("/"); }, 2000)
        } else if ((token && expiry && Date.now() <= Number(expiry)) || window.location.pathname === "/") {
            navigate("/dashboard/get");
            // window.location.reload(); // רענון הדף

        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("tokenExpiry");
        localStorage.removeItem("role"); // אם אתה שומר גם תפקיד
        navigate("/");    
        window.location.reload(); // רענון הדף
    };

    return (
        <>
        <header id="header">
            <div className="header-content">
                <img src={LOGO} alt="logo" className="logo" />
                <span className="title">جمعية تمهيد الرملة</span>
                <button className="logout-button" onClick={handleLogout}>تسجيل خروج</button>
                </div>
        </header>
        </>
    );
}
