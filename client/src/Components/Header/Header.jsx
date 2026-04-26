import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Header.module.css";
import LOGO from "../../images/logo.png";
import { getMe, logout } from "../../WebServer/services/auth/fuctionsAuth";
import { ask } from "../Provides/confirmBus";

const ADMIN_ROLES = ["ادارة", "إدارة", "الادارة", "الإدارة"];
const STUDENT_ROLES = [...ADMIN_ROLES, "مرشد"];

const normalizeRoles = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (error) {
      return [value];
    }

    return [value];
  }

  return [];
};

const hasAnyRole = (roles, allowedRoles) => allowedRoles.some((role) => roles.includes(role));

export default function Header() {
  const [user, setUser] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const headerRef = useRef(null);
  const navRef = useRef(null);

  const roles = normalizeRoles(user?.roles || localStorage.getItem("roles"));
  const isAdmin = hasAnyRole(roles, ADMIN_ROLES);
  const canViewStudents = hasAnyRole(roles, STUDENT_ROLES);
  const primaryRole = roles[0] || "";

  const loadData = useCallback(async () => {
    try {
      const currentUser = await getMe();
      setUser(currentUser || null);
    } catch (error) {
      console.error(error);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMenuOpen(false);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!menuOpen || !isMobile) return undefined;

    const onDocClick = (event) => {
      if (!headerRef.current) return;
      if (!headerRef.current.contains(event.target)) setMenuOpen(false);
    };

    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen, isMobile]);

  const handleLogout = async () => {
    await logout();
  };

  const EDIT_PATTERNS = [
    /^\/students\/(new|[^/]+)$/,
    /^\/users\/(new|[^/]+)$/,
    /^\/lessons\/(new|[^/]+)$/,
    /^\/subs\/(new|[^/]+)$/,
    /^\/selectSubfor\/[^/]+$/,
    /^\/regnextmonth$/,
  ];

  const onNavClick = async (event, to) => {
    setMenuOpen(false);
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;

    const anchor = event.currentTarget;
    if (anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();

    const onEditPage = EDIT_PATTERNS.some((pattern) => pattern.test(window.location.pathname));
    if (onEditPage) {
      const ok = await ask("navigate");
      if (!ok) return;
    }

    navigate(to);
  };

  return (
    <header id="header" className={styles.header} ref={headerRef}>
      <div className={styles.headerContent}>
        <img
          src={LOGO}
          alt="logo"
          className={styles.logo}
          onClick={(event) => onNavClick(event, "/")}
          style={{ cursor: "pointer" }}
        />
        <span className={styles.title}>جمعية تمهيد - الرملة</span>
        {user && !isMobile && (
          <div className={styles.userBadge}>
            {user.firstname} {user.lastname} - {isAdmin ? "ادارة" : roles.includes("مرشد") ? "مرشد" : "مساعد مرشد"}
          </div>
        )}
      </div>

      <div className={styles.headerContent}>
        {isMobile && (
          <button
            type="button"
            className={styles.menuToggle}
            aria-label="فتح القائمة"
            aria-controls="main-nav"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
          >
            <span />
            <span />
            <span />
          </button>
        )}
        {user && isMobile && (
          <div className={styles.userBadge}>
            {user.firstname} {user.lastname} - {primaryRole}
          </div>
        )}
      </div>

      {isMobile && menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} />}

      <nav
        id="main-nav"
        ref={navRef}
        className={`${styles.navbarV} ${isMobile ? styles.mobileNav : ""}`}
        data-open={isMobile ? menuOpen : true}
      >
        {isAdmin && (
          <a href="/dashboard" onClick={(event) => onNavClick(event, "/dashboard")}>لوحة التحكم</a>
        )}
        <a href="/calendar" onClick={(event) => onNavClick(event, "/calendar")}>حضور وغياب</a>
        {canViewStudents && (
          <a href="/students" onClick={(event) => onNavClick(event, "/students")}>قائمة الطلاب</a>
        )}
        {isAdmin && (
          <a href="/users" onClick={(event) => onNavClick(event, "/users")}>قائمة المستخدمين</a>
        )}
        <a href="/lessons" onClick={(event) => onNavClick(event, "/lessons")}>قائمة الدروس</a>
        <a href="/reports" onClick={(event) => onNavClick(event, "/reports")}>قائمة التقارير</a>
        <a href="/files" onClick={(event) => onNavClick(event, "/files")}>مدير الملفات</a>
        <a href="/profile" onClick={(event) => onNavClick(event, "/profile")}>ملف شخصي</a>
        <button type="button" onClick={handleLogout} className={styles.logoutButton} title="خروج">خروج</button>
      </nav>
    </header>
  );
}
