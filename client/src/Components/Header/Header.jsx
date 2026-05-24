import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Header.module.css";
import LOGO from "../../images/logo.png";
import { getMe, logout } from "../../WebServer/services/auth/fuctionsAuth";
import { ask } from "../Provides/confirmBus";
import { useI18n } from "../../i18n/I18nContext";

const ADMIN_ROLES = ["ادارة", "إدارة", "الادارة", "الإدارة", "Ø§Ø¯Ø§Ø±Ø©", "Ø¥Ø¯Ø§Ø±Ø©", "Ø§Ù„Ø§Ø¯Ø§Ø±Ø©", "Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©"];
const GUIDE_ROLES = ["مرشد", "Ù…Ø±Ø´Ø¯"];
const STUDENT_ROLES = [...ADMIN_ROLES, ...GUIDE_ROLES];

const normalizeRoles = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return [value];
    }

    return [value];
  }

  return [];
};

const hasAnyRole = (roles, allowedRoles) => allowedRoles.some((role) => roles.includes(role));

export default function Header() {
  const { dir, language, languages, setLanguage, t } = useI18n();
  const [user, setUser] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const headerRef = useRef(null);
  const navRef = useRef(null);

  const roles = normalizeRoles(user?.roles || localStorage.getItem("roles"));
  const isAdmin = hasAnyRole(roles, ADMIN_ROLES);
  const isGuide = hasAnyRole(roles, GUIDE_ROLES);
  const canViewStudents = hasAnyRole(roles, STUDENT_ROLES);
  const displayRole = isAdmin ? t("roles.admin") : isGuide ? t("roles.guide") : t("roles.assistantGuide");

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

  const languageSelect = (className) => (
    <label className={className}>
      <span>{t("common.language")}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value)}>
        {Object.values(languages).map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <header id="header" className={styles.header} ref={headerRef} dir={dir}>
      <div className={styles.headerContent}>
        <img
          src={LOGO}
          alt="logo"
          className={styles.logo}
          onClick={(event) => onNavClick(event, "/")}
          style={{ cursor: "pointer" }}
        />
        <span className={styles.title}>{t("appTitle")}</span>
        {user && !isMobile && (
          <div className={styles.userBadge}>
            {user.firstname} {user.lastname} - {displayRole}
          </div>
        )}
        {!isMobile && languageSelect(styles.languageSelectWrap)}
      </div>

      <div className={styles.headerContent}>
        {isMobile && (
          <button
            type="button"
            className={styles.menuToggle}
            aria-label={t("nav.openMenu")}
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
            {user.firstname} {user.lastname} - {displayRole}
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
          <a href="/dashboard" onClick={(event) => onNavClick(event, "/dashboard")}>{t("nav.dashboard")}</a>
        )}
        <a href="/calendar" onClick={(event) => onNavClick(event, "/calendar")}>{t("nav.attendance")}</a>
        {canViewStudents && (
          <a href="/students" onClick={(event) => onNavClick(event, "/students")}>{t("nav.students")}</a>
        )}
        {isAdmin && (
          <a href="/users" onClick={(event) => onNavClick(event, "/users")}>{t("nav.users")}</a>
        )}
        <a href="/lessons" onClick={(event) => onNavClick(event, "/lessons")}>{t("nav.lessons")}</a>
        <a href="/reports" onClick={(event) => onNavClick(event, "/reports")}>{t("nav.reports")}</a>
        <a href="/files" onClick={(event) => onNavClick(event, "/files")}>{t("nav.files")}</a>
        <a href="/profile" onClick={(event) => onNavClick(event, "/profile")}>{t("nav.profile")}</a>
        {isMobile && languageSelect(styles.mobileLanguageSelectWrap)}
        <button type="button" onClick={handleLogout} className={styles.logoutButton} title={t("nav.logout")}>{t("nav.logout")}</button>
      </nav>
    </header>
  );
}
