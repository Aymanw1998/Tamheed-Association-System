import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Header.module.css";
import LOGO from "../../images/logo.png";
import { getMe } from "../../WebServer/services/auth/fuctionsAuth";
import { ask } from "../Provides/confirmBus";
import { useToast } from "../../ALERT/SystemToasts";

export default function Header() {
    const { push } = useToast();  // ← מקבל את push מה-Provider
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [roles, setRoles] = useState(localStorage.getItem("roles"));
  const [user, setUser] = useState();
  const navigate = useNavigate();

  // --- מובייל / תפריט ---
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  useEffect(() => console.log("roles", roles), [roles]);
  useEffect(() => console.log("user", user), [user]);

  useEffect(() => {
    if (roles) setRoles(roles);
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const u = await getMe();
      setUser(u || null);
    } catch (e) {
      console.error(e);
      setErr("שגיאה בטעינת משתמשים");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    localStorage.setItem("LOGOUT_BROADCAST", "1");
    navigate("/");
  };

  // --- resize: קובע מובייל/דסקטופ וסוגר תפריט כשעוברים לדסקטופ ---
  useEffect(() => {
    const handleResize = () => {
      const m = window.innerWidth <= 768;
      setIsMobile(m);
      if (!m) setMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- click outside לסגירת התפריט במובייל ---
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (!navRef.current) return;
      if (!navRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  const EDIT_PATTERNS = [
    /^\/students\/(new|[^/]+)$/,
    /^\/users\/(new|[^/]+)$/,
    /^\/lessons\/(new|[^/]+)$/,
    /^\/subs\/(new|[^/]+)$/,
    /^\/selectSubfor\/[^/]+$/,
    /^\/regnextmonth$/,
  ];

  const onNavClick = async (e, to) => {
    setMenuOpen(false);
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    const a = e.currentTarget;
    if (a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    e.preventDefault();

    const onEditPage = EDIT_PATTERNS.some((rx) => rx.test(window.location.pathname));
    if (onEditPage) {
      const ok = await ask("navigate");
      if (!ok) return;
    }
    setMenuOpen(false);            // ← סגירת התפריט אחרי ניווט
    navigate(to);
  };

  return (
    <>
      <header id="header" className={styles.header}>
        <div className={styles.headerContent}>
          <img
            src={LOGO}
            alt="logo"
            className={styles.logo}
            onClick={(e) => onNavClick(e, "/")}
            style={{ cursor: "pointer" }}
          />
          <span className={styles.title}>جمعية تمهيد - الرملة </span>
          {user && !isMobile && (
            <div className={styles.userBadge}>
              {user?.firstname + " " + user?.lastname + " - "} {user?.roles.includes("ادارة") ? "ادارة" : user?.roles.includes("مرشد") ? "مرشد" : "مساعد مرشد"}
            </div>
          )}
        </div>
        <div className={styles.headerContent}>
          {isMobile && (
            <button
              className={styles.menuToggle}
              aria-label="פתיחת תפריט"
              aria-controls="main-nav"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          )}
          {user && isMobile && (
            <div className={styles.userBadge}>
              {user?.firstname + " " + user?.lastname + " - " + user?.roles[0]}
            </div>
          )}
        </div>
        {isMobile && menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} />}
        {isMobile ? (
            menuOpen && (
                    <nav style={menuOpen && !isMobile ? {} : {width: "100%"} }className={`${styles.navbarV} ${isMobile ? styles.mobileNav : ''}`} data-open={menuOpen}>
                      <a href="/calendar" onClick={(e) => onNavClick(e, "/calendar")}>حضور وغياب</a>
                      <a href="/students" onClick={(e) => onNavClick(e, "/students")}>قائمة الطلاب</a>
                      <a href="/users" onClick={(e) => onNavClick(e, "/users")}>قائمة المستخدمين</a>
                      <a href="/lessons" onClick={(e) => onNavClick(e, "/lessons")}>قائمة الدروس</a>
                      <a href="/reports" onClick={(e) => onNavClick(e, "/reports")}>قائمة التقارير</a>
                      <a href="/profile" onClick={(e) => onNavClick(e, "/profile")}>ملف شخصي</a>
                      <a href="#" onClick={(e) => onNavClick(e, "#")}>Drive</a>
                      <button onClick={handleLogout} className={styles.logoutButton} title="خروج"> 🔓 خروج</button>
                    </nav>
                )
        ) : (
            <nav style={{width: "100%"}} className={`${styles.navbarV} ${isMobile ? styles.mobileNav : styles.navbarV}`} data-open={menuOpen}>
                <a href="/calendar" onClick={(e) => onNavClick(e, "/calendar")}>حضور وغياب</a>
                <a href="/students" onClick={(e) => onNavClick(e, "/students")}>قائمة الطلاب</a>
                <a href="/users" onClick={(e) => onNavClick(e, "/users")}>قائمة المستخدمين</a>
                <a href="/lessons" onClick={(e) => onNavClick(e, "/lessons")}>قائمة الدروس</a>
                <a href="/reports" onClick={(e) => onNavClick(e, "/reports")}>قائمة التقارير</a>
                <a href="/profile" onClick={(e) => onNavClick(e, "/profile")}>ملف شخصي</a>
                <a href="#" onClick={(e) => onNavClick(e, "#")}>Drive</a>
                <button onClick={handleLogout} className={styles.logoutButton} title="خروج"> 🔓 خروج</button>
            </nav>
        )}
      </header>
    </>
  );
}
