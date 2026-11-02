import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Header.module.css";
import LOGO from "../../images/logo.png";
import { getMe, logout } from "../../WebServer/services/auth/fuctionsAuth";
import { getMyPermissions } from "../../WebServer/services/vehicle/functionsVehicle";
import { confirmLeave } from "../../utils/unsavedChanges";
import { useI18n } from "../../i18n/I18nContext";
import NoticeBell from "../Notice/NoticeBell";
import { ADMIN_ROLES, GUIDE_ROLES, canStored, normalizeRoles } from "../../utils/session";
import NewBadge from "../../tours/NewBadge";
import { InstallAppButton } from "../../pwa/InstallApp";

const hasAnyRole = (roles, allowedRoles) => allowedRoles.some((role) => roles.includes(role));

// The user's name opens a small menu: profile, installing the app (phones
// only) and signing out (owner, 2026-11-02: they left the main menu). It is
// there before the user's details load, so signing out is always reachable.
function AccountMenu({ label, onNav, onLogout, t }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <div className={styles.account} ref={boxRef} onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        className={styles.userBadge}
        data-testid="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id="account-menu" role="menu" className={styles.accountMenu} data-testid="account-menu">
          <a href="/profile" role="menuitem" data-tour="menu-profile" onClick={(event) => { setOpen(false); onNav(event, "/profile"); }}>{t("nav.profile")}</a>
          {/* Phones only, until the app is installed. */}
          <InstallAppButton className={styles.installButton} />
          <button type="button" role="menuitem" onClick={onLogout} className={styles.logoutButton}>{t("nav.logout")}</button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { dir, t } = useI18n();
  const [user, setUser] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [menuOpen, setMenuOpen] = useState(false);
  const [canViewVehicles, setCanViewVehicles] = useState(false);
  const navigate = useNavigate();
  const headerRef = useRef(null);
  const navRef = useRef(null);

  const roles = normalizeRoles(user?.roles || localStorage.getItem("roles"));
  // Role names only pick the label; the links follow stored permissions.
  const isAdmin = hasAnyRole(roles, ADMIN_ROLES);
  const isGuide = hasAnyRole(roles, GUIDE_ROLES);
  const canViewStudents = canStored("students.view");
  const canViewUsers = canStored("users.view");
  const canViewNotices = canStored("notices.view");
  const canViewAudit = canStored("audit.view");
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

  // The vehicles link appears only for people the server allows to view them.
  useEffect(() => {
    let live = true;
    getMyPermissions().then((res) => {
      if (live) setCanViewVehicles(Boolean(res.ok && res.permissions?.includes("view")));
    });
    return () => {
      live = false;
    };
  }, []);

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

  const onNavClick = async (event, to) => {
    setMenuOpen(false);
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;

    const anchor = event.currentTarget;
    if (anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();

    if (!(await confirmLeave(window.location.pathname))) return;

    navigate(to);
  };

  const accountMenu = (
    <AccountMenu
      label={user ? `${user.firstname || ""} ${user.lastname || ""} - ${displayRole}` : t("nav.account")}
      onNav={onNavClick}
      onLogout={handleLogout}
      t={t}
    />
  );

  return (
    <header id="header" className={styles.header} ref={headerRef} dir={dir}>
      <div className={styles.headerContent}>
        {/* The logo is the way to the dashboard. */}
        <a href="/dashboard" data-tour="menu-dashboard" title={t("nav.dashboard")} onClick={(event) => onNavClick(event, "/dashboard")}>
          <img src={LOGO} alt={t("nav.dashboard")} className={styles.logo} />
        </a>
        <span className={styles.title}>{t("appTitle")}</span>
        {!isMobile && accountMenu}
      </div>

      <div className={styles.headerContent}>
        {isMobile && (
          <button
            type="button"
            className={styles.menuToggle}
            data-tour="menu-toggle"
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
        {canViewNotices && (
          <span data-tour="notice-bell" style={{ display: "inline-flex", alignItems: "center" }}>
            <NoticeBell onOpen={(event) => onNavClick(event, "/notices")} />
            <NewBadge section="notices" />
          </span>
        )}
        {isMobile && accountMenu}
      </div>

      {isMobile && menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} />}

      <nav
        id="main-nav"
        data-tour="menu"
        ref={navRef}
        className={`${styles.navbarV} ${isMobile ? styles.mobileNav : ""}`}
        data-open={isMobile ? menuOpen : true}
      >
        <a href="/calendar" data-tour="menu-calendar" onClick={(event) => onNavClick(event, "/calendar")}>{t("nav.attendance")}<NewBadge section="calendar" /></a>
        {canViewUsers && (
          <a href="/users" data-tour="menu-users" onClick={(event) => onNavClick(event, "/users")}>{t("nav.users")}<NewBadge section="users" /></a>
        )}
        {canViewStudents && (
          <a href="/students" data-tour="menu-students" onClick={(event) => onNavClick(event, "/students")}>{t("nav.students")}<NewBadge section="students" /></a>
        )}
        {/* {canViewNotices && (
          <a href="/notices" onClick={(event) => onNavClick(event, "/notices")}>{t("nav.notices")}</a>
        )} */}
        <a href="/lessons" data-tour="menu-lessons" onClick={(event) => onNavClick(event, "/lessons")}>{t("nav.lessons")}<NewBadge section="lessons" /></a>
        <a href="/reports" data-tour="menu-reports" onClick={(event) => onNavClick(event, "/reports")}>{t("nav.reports")}<NewBadge section="reports" /></a>
        <a href="/files" data-tour="menu-files" onClick={(event) => onNavClick(event, "/files")}>{t("nav.files")}<NewBadge section="files" /></a>
        {canViewVehicles && (
          <a href="/vehicles" data-tour="menu-vehicles" onClick={(event) => onNavClick(event, "/vehicles")}>{t("nav.vehicles")}<NewBadge section="vehicles" /></a>
        )}
        {(canStored("sports.view") || canStored("sports.coach") || canStored("sports.manage")) && (
          <a href="/sports" data-tour="menu-sports" onClick={(event) => onNavClick(event, "/sports")}>{t("nav.sports")}</a>
        )}
        {/* {canViewAudit && (
          <a href="/audit" data-tour="menu-audit" onClick={(event) => onNavClick(event, "/audit")}>{t("nav.audit")}<NewBadge section="audit" /></a>
        )} */}
      </nav>
    </header>
  );
}
