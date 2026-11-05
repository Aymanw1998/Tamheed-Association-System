import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Header.module.css";
import LOGO from "../../images/logo.png";
import { getMe, logout, requestItPass } from "../../WebServer/services/auth/fuctionsAuth";
import { getMyPermissions } from "../../WebServer/services/vehicle/functionsVehicle";
import { confirmLeave } from "../../utils/unsavedChanges";
import { useI18n } from "../../i18n/I18nContext";
import NoticeBell from "../Notice/NoticeBell";
import { ADMIN_ROLES, GUIDE_ROLES, canStored, getStoredPermissions, normalizeRoles } from "../../utils/session";
import { canAccessPath } from "../../utils/routeAccess";
import NewBadge from "../../tours/NewBadge";
import { InstallAppButton } from "../../pwa/InstallApp";
import { toast } from "../../ALERT/SystemToasts";
import { itUrlWithPass, openSite } from "../../utils/siteLink";

const hasAnyRole = (roles, allowedRoles) => allowedRoles.some((role) => roles.includes(role));

// The user's name opens a small menu: profile, installing the app (phones
// only) and signing out (owner, 2026-11-02: they left the main menu). It is
// there before the user's details load, so signing out is always reachable.
function AccountMenu({ label, onNav, onLogout, t, showIt, onItRefused }) {
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

  // «قسم الIT»: a one-time pass from the server, then the IT site in a new tab
  // (openSite), signed in without typing the password. A 403 means this user
  // has no IT side: no button.
  const openIt = async () => {
    setOpen(false);
    try {
      const pass = await requestItPass();
      if (!pass) {
        onItRefused();
        return;
      }
      // A new tab with the full address (an installed app opens the IT app).
      openSite(itUrlWithPass(pass));
    } catch {
      toast.error(t("nav.itFailed"));
    }
  };

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
          {showIt && (
            <button type="button" role="menuitem" data-testid="it-site-button" className={styles.switchSite} onClick={openIt}>
              <span className={styles.switchIcon} aria-hidden="true">⇄</span>
              <span className={styles.switchText}>
                <strong>{t("nav.itSite")}</strong>
                <small>{t("nav.itSiteHint")}</small>
              </span>
            </button>
          )}
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
  const [itRefused, setItRefused] = useState(false);
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
  // The page links follow the same rules as the pages (utils/routeAccess).
  const opens = (path) => canAccessPath(path, getStoredPermissions());
  const displayRole = user?.isSystem === true ? t("roles.system") : isAdmin ? t("roles.admin") : isGuide ? t("roles.guide") : t("roles.assistantGuide");

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

  // An IT user who is not blocked, the system account included; the server
  // decides when the button is pressed.
  const showIt = !itRefused && (user?.isSystem === true || (user?.isIT === true && !user.itBlockedAt));
  const accountMenu = (
    <AccountMenu
      showIt={showIt}
      onItRefused={() => setItRefused(true)}
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
        <span data-tour="notice-bell" style={{ display: "inline-flex", alignItems: "center" }}>
          <NoticeBell canViewNotices={canViewNotices} />
          {canViewNotices && <NewBadge section="notices" />}
        </span>
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
        {opens("/calendar") && (
          <a href="/calendar" data-tour="menu-calendar" onClick={(event) => onNavClick(event, "/calendar")}>{t("nav.attendance")}<NewBadge section="calendar" /></a>
        )}
        {canViewUsers && (
          <a href="/users" data-tour="menu-users" onClick={(event) => onNavClick(event, "/users")}>{t("nav.users")}<NewBadge section="users" /></a>
        )}
        {canViewStudents && (
          <a href="/students" data-tour="menu-students" onClick={(event) => onNavClick(event, "/students")}>{t("nav.students")}<NewBadge section="students" /></a>
        )}
        {/* {canViewNotices && (
          <a href="/notices" onClick={(event) => onNavClick(event, "/notices")}>{t("nav.notices")}</a>
        )} */}
        {opens("/lessons") && (
          <a href="/lessons" data-tour="menu-lessons" onClick={(event) => onNavClick(event, "/lessons")}>{t("nav.lessons")}<NewBadge section="lessons" /></a>
        )}
        {opens("/reports") && (
          <a href="/reports" data-tour="menu-reports" onClick={(event) => onNavClick(event, "/reports")}>{t("nav.reports")}<NewBadge section="reports" /></a>
        )}
        {opens("/files") && (
          <a href="/files" data-tour="menu-files" onClick={(event) => onNavClick(event, "/files")}>{t("nav.files")}<NewBadge section="files" /></a>
        )}
        {canViewVehicles && (
          <a href="/vehicles" data-tour="menu-vehicles" onClick={(event) => onNavClick(event, "/vehicles")}>{t("nav.vehicles")}<NewBadge section="vehicles" /></a>
        )}
        {(canStored("sports.view") || canStored("sports.coach") || canStored("sports.manage")) && (
          <a href="/sports" data-tour="menu-sports" onClick={(event) => onNavClick(event, "/sports")}>{t("nav.sports")}</a>
        )}
      </nav>
    </header>
  );
}
