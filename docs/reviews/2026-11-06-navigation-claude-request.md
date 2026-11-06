PENDING actual Claude Code independent review of Codex implementation. Read supplied source only. No edits, tools or recursive reviewers. Actual Claude is currently blocked by its recorded weekly quota until Nov 8 16:00 Asia/Jerusalem; this packet has no review response.
Owner approved grouped top disclosure navigation on desktop, hamburger drawer with expandable groups on mobile, a direct first Program shortcut, current-page/group indication, permission-filtered links and internal app back/forward controls above content. Preserve account/IT switching and guided-tour anchors. Native history must not leave the signed-in app on a direct entry; retain query/state and restore scroll after async list loading; confirm unsaved edits before toolbar navigation. Role changes must not expose revoked destinations. Find concrete bugs with file/line and failure scenario.
Context: Header mounts inside ProtectedLayout; Header itself remounts on permission/demo changes while NavigationHistory stays mounted. Routes already enforce permissions. getStoredPermissions returns expanded permission leaves. Program shortcut uses attendance if lessons unavailable. A scoped vehicle list follows the server permission fetch. Guided-tour target lookup now opens matching hidden nav ancestors through marked synthetic tour clicks. No real user data, environment files, credentials or logs included.

SOURCE: apps/system/src/Components/Header/Header.jsx

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Header.module.css";
import NavigationMenu from "./NavigationMenu";
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
    <header id="header" className={styles.header} ref={headerRef} dir={dir} data-menu-open={isMobile && menuOpen}>
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

      <NavigationMenu mobile={isMobile} open={menuOpen} onClose={() => setMenuOpen(false)} onNav={onNavClick}
        program={(opens("/lessons") || opens("/calendar")) ? { path: opens("/lessons") ? "/lessons" : "/calendar", label: t("nav.lessons"), tour: "menu-lessons", badge: "lessons" } : null}
        groups={[
          { id: "daily", label: "العمل اليومي", items: [
            { path: "/weekly-tasks", label: "المهمات الأسبوعية", tour: "menu-weekly-tasks" },
            opens("/sports") && { path: "/sports", label: t("nav.sports"), tour: "menu-sports" },
          ] },
          { id: "people", label: "الأعضاء والطاقم", items: [
            canViewStudents && { path: "/students", label: t("nav.students"), tour: "menu-students", badge: "students" },
            canViewUsers && { path: "/users", label: "طاقم الجمعية", tour: "menu-users", badge: "users" },
          ] },
          { id: "followup", label: "المتابعة", items: [
            opens("/reports") && { path: "/reports", label: t("nav.reports"), tour: "menu-reports", badge: "reports" },
            canViewNotices && { path: "/notices", label: t("nav.notices"), tour: "menu-notices", badge: "notices" },
          ] },
          { id: "resources", label: "الموارد", items: [
            opens("/files") && { path: "/files", label: t("nav.files"), tour: "menu-files", badge: "files" },
            canViewVehicles && { path: "/vehicles", label: t("nav.vehicles"), tour: "menu-vehicles", badge: "vehicles" },
          ] },
        ].map((group) => ({ ...group, items: group.items.filter(Boolean) })).filter((group) => group.items.length)}
      />
    </header>
  );
}


SOURCE: apps/system/src/Components/Header/NavigationMenu.jsx

import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import NewBadge from "../../tours/NewBadge";
import styles from "./NavigationMenu.module.css";

const activeAt = (item, path) => item.path === "/lessons" ? /^\/(lessons|calendar)(\/|$)/.test(path) : path === item.path || path.startsWith(`${item.path}/`);

export default function NavigationMenu({ groups, program, mobile, open, onClose, onNav }) {
  const { pathname } = useLocation();
  const nav = useRef(null);
  const triggers = useRef({});
  const activeGroup = groups.find((group) => group.items.some((item) => activeAt(item, pathname)))?.id || null;
  const [expanded, setExpanded] = useState(mobile ? activeGroup : null);
  useEffect(() => { setExpanded(mobile ? activeGroup : null); onClose(); }, [pathname, mobile]); // close after route changes
  useEffect(() => {
    const outside = (event) => { if (nav.current && !nav.current.contains(event.target)) setExpanded(null); };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return undefined;
    setExpanded(activeGroup);
    const previous = document.querySelector('[data-tour="menu-toggle"]') || document.activeElement;
    nav.current?.querySelector("button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, [mobile, open]);

  const link = (item) => <a key={item.path} href={item.path} data-tour={item.tour}
    aria-current={activeAt(item, pathname) ? "page" : undefined}
    onClick={(event) => { onClose(); if (!mobile) setExpanded(null); onNav(event, item.path); }}>
    {item.label}{item.badge && <NewBadge section={item.badge} />}
  </a>;

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (mobile) onClose();
      else { triggers.current[expanded]?.focus(); setExpanded(null); }
    }
    if (mobile && open && event.key === "Tab") {
      const elements = [...nav.current.querySelectorAll("a,button")].filter((element) => !element.closest("[hidden]") && !element.disabled);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };

  return <>
    {mobile && open && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
    <div ref={nav} className={`${styles.shell} ${mobile ? styles.drawer : ""}`} hidden={mobile && !open}
      role={mobile && open ? "dialog" : undefined} aria-modal={mobile && open ? "true" : undefined}
      aria-label={mobile ? "القائمة الرئيسية" : undefined} onKeyDown={onKey}
      onBlur={(event) => { if (!mobile && !event.currentTarget.contains(event.relatedTarget)) setExpanded(null); }}>
      {mobile && <div className={styles.drawerHead}><strong>القائمة الرئيسية</strong><button type="button" onClick={onClose} aria-label="إغلاق القائمة">×</button></div>}
      <nav id="main-nav" data-tour="menu" aria-label="التنقل الرئيسي" className={styles.nav}>
        {program && <div className={styles.shortcut}>{link(program)}</div>}
        {groups.map((group) => <div key={group.id} className={styles.group}>
          <button ref={(element) => { triggers.current[group.id] = element; }} type="button"
            className={styles.groupButton} data-active={group.id === activeGroup}
            aria-expanded={expanded === group.id} aria-controls={`nav-group-${group.id}`}
            onClick={() => setExpanded((current) => current === group.id ? null : group.id)}
            onKeyDown={(event) => { if (!mobile && event.key === "ArrowDown") { event.preventDefault(); setExpanded(group.id); requestAnimationFrame(() => nav.current?.querySelector(`#nav-group-${group.id} a`)?.focus()); } }}>
            {group.label}<span aria-hidden="true">{expanded === group.id ? "▴" : "▾"}</span>
          </button>
          <div id={`nav-group-${group.id}`} className={styles.panel} hidden={expanded !== group.id}>{group.items.map(link)}</div>
        </div>)}
      </nav>
    </div>
  </>;
}


SOURCE: apps/system/src/Components/Header/NavigationMenu.module.css

.shell { position: relative; z-index: 1300; }
.shell[hidden], .panel[hidden] { display: none; }
.nav { display: flex; align-items: stretch; flex-wrap: wrap; gap: 4px; padding: 5px 10px; border-radius: var(--radius-lg); background: var(--color-primary-700); }
.group { position: relative; }
.groupButton, .shortcut a { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 9px 16px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-text-on-primary); font: inherit; text-decoration: none; cursor: pointer; }
.groupButton:hover, .groupButton[aria-expanded="true"], .groupButton[data-active="true"], .shortcut a[aria-current="page"] { background: var(--color-primary-500); }
.panel { position: absolute; inset-inline-start: 0; top: calc(100% + 5px); min-width: 200px; padding: 6px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-lg); }
.panel a { display: flex; gap: 8px; align-items: center; min-height: 44px; padding: 10px 12px; border-radius: var(--radius-md); color: var(--color-text-primary); text-decoration: none; }
.panel a:hover, .panel a[aria-current="page"] { background: var(--color-primary-100); color: var(--color-primary-700); }
.nav a:focus-visible, .nav button:focus-visible, .drawerHead button:focus-visible { outline: 2px solid var(--color-accent-500); outline-offset: 2px; }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 1500; }
.drawer { position: fixed; inset-block: 0; inset-inline-start: 0; width: min(340px, 90vw); overflow-y: auto; background: var(--color-surface); z-index: 1501; box-shadow: var(--shadow-lg); padding: env(safe-area-inset-top, 0px) 12px env(safe-area-inset-bottom, 0px); }
.drawerHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; color: var(--color-text-primary); }
.drawerHead button { min-width: 44px; min-height: 44px; font: inherit; font-size: 24px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-primary); cursor: pointer; }
.drawer .nav { display: flex; flex-direction: column; align-items: stretch; padding: 0; background: var(--color-surface); }
.drawer .groupButton, .drawer .shortcut a { width: 100%; color: var(--color-text-primary); }
.drawer .groupButton[data-active="true"], .drawer .groupButton[aria-expanded="true"], .drawer .shortcut a[aria-current="page"] { background: var(--color-primary-100); color: var(--color-primary-700); }
.drawer .panel { position: static; min-width: 0; padding: 0 12px; border: 0; box-shadow: none; border-inline-start: 2px solid var(--color-border); margin: 4px 12px 10px; }


SOURCE: apps/system/src/Components/Routes/NavigationHistory.jsx

import React, { useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { initialHistory, parentDestination, recordLocation, restorePageScroll } from "../../utils/navigationHistory";
import { getStoredPermissions } from "../../utils/session";
import { canAccessPath } from "../../utils/routeAccess";
import { confirmLeave } from "../../utils/unsavedChanges";
import styles from "./NavigationHistory.module.css";

export default function NavigationHistory() {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const [history, setHistory] = useState(() => initialHistory(location));
  const [busy, setBusy] = useState(false);
  const currentKey = useRef(location.key);
  const scroll = useRef(new Map());
  const previousKey = useRef(location.key);
  currentKey.current = location.key;
  useLayoutEffect(() => {
    let stopRestoring;
    setHistory((previous) => recordLocation(previous, location, action));
    if (action === "POP" && previousKey.current !== location.key) {
      const position = scroll.current.get(location.key);
      if (position) stopRestoring = restorePageScroll(position);
    }
    previousKey.current = location.key;
    return () => { stopRestoring?.(); scroll.current.set(location.key, { x: window.scrollX, y: window.scrollY }); };
  }, [location, action]);

  const allowed = (entry) => entry && canAccessPath(entry.pathname, getStoredPermissions());
  const back = history.entries[history.index - 1];
  const forward = history.entries[history.index + 1];
  let parent = parentDestination(location.pathname);
  if (!canAccessPath(parent, getStoredPermissions())) parent = "/dashboard";
  const canGoBack = allowed(back) || (!back && parent !== location.pathname);
  const canGoForward = allowed(forward);
  const go = async (direction) => {
    if (busy) return;
    const key = location.key;
    setBusy(true);
    try {
      if (!(await confirmLeave(location.pathname)) || key !== currentKey.current) return;
      if (direction === -1 && allowed(back)) navigate(-1);
      else if (direction === 1 && allowed(forward)) navigate(1);
      else if (direction === -1 && !back && parent !== location.pathname) navigate(parent, { replace: true });
    } finally { setBusy(false); }
  };
  return <nav className={styles.bar} aria-label="التنقل بين الصفحات" dir="rtl">
    <button type="button" onClick={() => go(-1)} disabled={busy || !canGoBack}><span aria-hidden="true">→</span> رجوع</button>
    <button type="button" onClick={() => go(1)} disabled={busy || !canGoForward}>تقدّم <span aria-hidden="true">←</span></button>
  </nav>;
}


SOURCE: apps/system/src/utils/navigationHistory.js

// History is bounded by this signed-in layout, never by an external referrer.
export const initialHistory = (location) => ({ entries: [location], index: 0 });
export function recordLocation(history, location, action) {
  const current = history.entries[history.index];
  if (current.key === location.key) return history;
  if (action === "REPLACE") {
    const entries = [...history.entries]; entries[history.index] = location;
    return { entries, index: history.index };
  }
  if (action === "POP") {
    const index = history.entries.findIndex((entry) => entry.key === location.key);
    return index >= 0 ? { ...history, index } : initialHistory(location);
  }
  const entries = [...history.entries.slice(0, history.index + 1), location];
  return { entries, index: entries.length - 1 };
}

export function parentDestination(path) {
  const edit = path.match(/^\/(lessons|students|users)\/([^/]+)\/edit$/);
  if (edit) return `/${edit[1]}/${edit[2]}`;
  if (path === "/weekly-tasks/manage") return "/weekly-tasks";
  if (/^\/calendar$/.test(path)) return "/lessons";
  const section = path.match(/^\/(lessons|students|users|reports|vehicles)\/[^/]+$/);
  return section ? `/${section[1]}` : "/dashboard";
}

// Lists often load after the route mounts. Wait for enough document height to
// restore the saved position, and stop immediately if the person interacts.
export function restorePageScroll(position, win = window, doc = document) {
  let stopped = false, observer, timer;
  const events = ["wheel", "touchstart", "pointerdown", "keydown"];
  const stop = () => {
    stopped = true; observer?.disconnect(); win.clearTimeout(timer);
    events.forEach((event) => win.removeEventListener(event, stop));
  };
  const apply = () => {
    if (stopped) return;
    const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
    if (position.y > 0 && height - win.innerHeight < position.y) return;
    win.scrollTo(position.x, position.y); stop();
  };
  events.forEach((event) => win.addEventListener(event, stop, { passive: true }));
  if (win.ResizeObserver) { observer = new win.ResizeObserver(apply); observer.observe(doc.body || doc.documentElement); }
  timer = win.setTimeout(stop, 30000);
  apply();
  return stop;
}


SOURCE: apps/system/src/utils/unsavedChanges.js

import { useEffect, useRef } from "react";
import { ask } from "../Components/Provides/confirmBus";

// Edit pages report whether they hold unsaved edits so navigation guards only
// warn when there is something to lose. null means "this page doesn't report".
let state = null;

export const setUnsavedChanges = (value) => {
  state = value;
};

export const getUnsavedChanges = () => state;

// Pages whose edits a navigation away could lose.
export const EDIT_PATTERNS = [
  // A student, user or lesson opens on a read-only page (/x/:id); its form is
  // /x/new or /x/:id/edit.
  /^\/students\/(new|[^/]+\/edit)$/,
  /^\/users\/(new|[^/]+\/edit)$/,
  /^\/lessons\/(new|[^/]+\/edit)$/,
  /^\/reports\/[^/]+$/,
  /^\/weekly-tasks\/manage$/,
  /^\/vehicles\/(new|[^/]+)$/,
  /^\/subs\/(new|[^/]+)$/,
  /^\/selectSubfor\/[^/]+$/,
  /^\/regnextmonth$/,
];

// Leaving `pathname` needs a confirmation: an edit page that has unsaved edits or
// does not report (null). Only a page that says "nothing to lose" (false) is let go.
export const needsLeaveConfirm = (pathname, unsaved = state) =>
  EDIT_PATTERNS.some((pattern) => pattern.test(String(pathname || ""))) && unsaved !== false;

// Asks before leaving an edit page; resolves true when it is fine to navigate.
// Used by the menu and by the product tour before they move to another page.
export async function confirmLeave(pathname = window.location.pathname, confirm = ask) {
  if (!needsLeaveConfirm(pathname)) return true;
  return Boolean(await confirm("navigate"));
}

// Snapshot `value` once `ready`, then flag any later difference as unsaved.
export function useUnsavedChanges(value, ready) {
  const baseline = useRef(null);
  const serialized = JSON.stringify(value);

  useEffect(() => {
    if (!ready) return;
    if (baseline.current === null) baseline.current = serialized;
    setUnsavedChanges(serialized !== baseline.current);
  }, [serialized, ready]);

  useEffect(() => () => setUnsavedChanges(null), []);
}


SOURCE: apps/system/src/Components/Header/Header.test.js

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/auth/fuctionsAuth", () => ({ getMe: jest.fn(), logout: jest.fn(), requestItPass: jest.fn() }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../../WebServer/services/vehicle/functionsVehicle", () => ({ getMyPermissions: jest.fn() }));
jest.mock("../../utils/unsavedChanges", () => ({ confirmLeave: () => Promise.resolve(true) }));
jest.mock("../Notice/NoticeBell", () => () => null);
jest.mock("../../tours/NewBadge", () => () => null);
jest.mock("../../pwa/InstallApp", () => ({ InstallAppButton: () => <button type="button" data-testid="install-app">install</button> }));
let mockPerms = [];
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
  getStoredPermissions: () => mockPerms,
}));

import { getMe, logout, requestItPass } from "../../WebServer/services/auth/fuctionsAuth";
import { getMyPermissions } from "../../WebServer/services/vehicle/functionsVehicle";
import Header from "./Header";
import { I18nProvider } from "../../i18n/I18nContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-02: the menu holds the pages only. The dashboard is the
// logo; profile, installing the app and signing out are in a small menu
// under the user's name.
let host, root;
const mount = async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<I18nProvider><MemoryRouter initialEntries={["/lessons"]}><Routes>
    <Route path="*" element={<><Header /><Probe /></>} />
  </Routes></MemoryRouter></I18nProvider>));
};
const { useLocation } = jest.requireActual("react-router");
function Probe() {
  return <p data-testid="at">{useLocation().pathname}</p>;
}
const at = () => host.querySelector('[data-testid="at"]').textContent;
const navText = () => [...host.querySelectorAll("#main-nav a")].map((el) => el.textContent.trim());
const accountButton = () => host.querySelector('[data-testid="account-button"]');
const accountMenu = () => host.querySelector('[data-testid="account-menu"]');
const item = (label) => [...(accountMenu()?.querySelectorAll("a, button") || [])].find((el) => el.textContent.trim() === label);

beforeEach(() => {
  mockPerms = ["students.view", "users.view", "attendance.view", "lessons.view", "reports.create", "files.use"];
  window.innerWidth = 1280;
  getMe.mockResolvedValue({ firstname: "أيمن", lastname: "و", roles: ["ادارة"] });
  getMyPermissions.mockResolvedValue({ ok: true, permissions: [] });
  logout.mockResolvedValue();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("the menu has the pages only: no dashboard, profile, install or sign-out", async () => {
  await mount();
  expect(navText()).toEqual(["البرنامج", "المهمات الأسبوعية", "الطلاب", "طاقم الجمعية", "التقارير", "الملفات"]);
});

test("the logo opens the dashboard", async () => {
  await mount();
  const logo = host.querySelector('a[href="/dashboard"] img')?.closest("a");
  expect(logo).toBeTruthy();
  await act(async () => logo.click());
  expect(at()).toBe("/dashboard");
});

test("the user's name opens a menu with profile, install and sign-out", async () => {
  await mount();
  expect(accountButton().textContent).toContain("أيمن");
  expect(accountMenu()).toBeNull();
  await act(async () => accountButton().click());
  expect(accountButton().getAttribute("aria-expanded")).toBe("true");
  expect(item("الملف الشخصي")).toBeDefined();
  expect(accountMenu().querySelector('[data-testid="install-app"]')).not.toBeNull();
  expect(item("تسجيل الخروج")).toBeDefined();
});

test("profile in the name menu opens the profile and closes the menu", async () => {
  await mount();
  await act(async () => accountButton().click());
  await act(async () => item("الملف الشخصي").click());
  expect(at()).toBe("/profile");
  expect(accountMenu()).toBeNull();
});

test("sign-out in the name menu signs out", async () => {
  await mount();
  await act(async () => accountButton().click());
  await act(async () => item("تسجيل الخروج").click());
  expect(logout).toHaveBeenCalled();
});

test("Escape and a click outside close the name menu", async () => {
  await mount();
  await act(async () => accountButton().click());
  await act(async () => accountMenu().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(accountMenu()).toBeNull();
  await act(async () => accountButton().click());
  await act(async () => document.body.click());
  expect(accountMenu()).toBeNull();
});

test("sign-out is reachable before the user's details load", async () => {
  getMe.mockReturnValue(new Promise(() => {}));
  await mount();
  await act(async () => accountButton().click());
  expect(item("تسجيل الخروج")).toBeDefined();
});


// Owner, 2026-11-03: taking a section away (e.g. reports from a guide) takes
// its link out of the menu too.
test("each page link follows its permission", async () => {
  mockPerms = ["students.view", "lessons.view"];
  await mount();
  expect(navText()).toEqual(["البرنامج", "المهمات الأسبوعية", "الطلاب"]);
});

const groupButton = (name) => [...host.querySelectorAll('#main-nav button')].find((button) => button.textContent.includes(name));
test("desktop groups open on click and ArrowDown, close on Escape/outside, and mark the active page", async () => {
  await mount();
  expect(host.querySelector('#main-nav a').textContent).toBe("البرنامج");
  expect(host.querySelector('#main-nav a').getAttribute("aria-current")).toBe("page");
  const people = groupButton("الأعضاء والطاقم");
  await act(async () => people.click());
  expect(people.getAttribute("aria-expanded")).toBe("true");
  await act(async () => host.querySelector('a[href="/students"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(people.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(people);
  await act(async () => people.click());
  await act(async () => document.body.click());
  expect(people.getAttribute("aria-expanded")).toBe("false");
});
test("mobile drawer expands groups, closes after navigation and returns focus to its toggle", async () => {
  window.innerWidth = 375;
  await mount();
  const toggle = host.querySelector('[data-tour="menu-toggle"]');
  toggle.focus();
  await act(async () => toggle.click());
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.style.overflow).toBe("hidden");
  await act(async () => groupButton("الأعضاء والطاقم").click());
  await act(async () => host.querySelector('#main-nav a[href="/students"]').click());
  expect(at()).toBe("/students");
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(toggle);
  await act(async () => toggle.click());
  expect(groupButton("الأعضاء والطاقم").getAttribute("aria-expanded")).toBe("true");
  await act(async () => host.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.body.style.overflow).not.toBe("hidden");
});
test("groups with no permitted pages are absent", async () => {
  mockPerms = [];
  await mount();
  expect(groupButton("الأعضاء والطاقم")).toBeUndefined();
  expect(groupButton("المتابعة")).toBeUndefined();
  expect(groupButton("الموارد")).toBeUndefined();
  expect(navText()).toEqual(["المهمات الأسبوعية"]);
});

// The system account has no everyday role: its label is «النظام», not an assistant's.
test("the system account's label is «النظام»", async () => {
  getMe.mockResolvedValue({ firstname: "أيمن", lastname: "و", roles: [], isSystem: true });
  await mount();
  expect(accountButton().outerHTML).toContain("النظام");
  expect(accountButton().outerHTML).not.toContain("مساعد مرشد");
});

// Owner, 2026-11-03: «قسم الIT» opens the IT site already signed in, for a user
// who is IT, not blocked, with an everyday role.
const IT_USER = { firstname: "أيمن", lastname: "و", roles: ["ادارة"], role: "ادارة", isIT: true };
const itButton = () => accountMenu()?.querySelector("[data-testid=\"it-site-button\"]") || undefined;
const openMenu = async () => act(async () => accountButton().click());

test("«قسم الIT» is in the name menu for an IT user with an everyday role", async () => {
  getMe.mockResolvedValue(IT_USER);
  await mount();
  await openMenu();
  expect(itButton()).toBeDefined();
});

test.each([
  ["not IT", { ...IT_USER, isIT: false }],
  ["IT but blocked", { ...IT_USER, itBlockedAt: "2026-11-01T10:00:00Z" }],
])("no «قسم الIT» for %s", async (_, user) => {
  getMe.mockResolvedValue(user);
  await mount();
  await openMenu();
  expect(itButton()).toBeUndefined();
});

describe("opening the IT site", () => {
  let tab;
  beforeEach(() => {
    process.env.REACT_APP_IT_URL = "https://it.example.test";
    tab = { location: { href: "" }, close: jest.fn(), opener: {} };
    jest.spyOn(window, "open").mockImplementation(() => tab);
    requestItPass.mockReset();
    getMe.mockResolvedValue(IT_USER);
  });
  afterEach(() => { delete process.env.REACT_APP_IT_URL; jest.restoreAllMocks(); });

  test("the pass is asked for only on click, and a new tab opens with it in the fragment", async () => {
    requestItPass.mockResolvedValue("one-time_pass");
    await mount();
    await openMenu();
    expect(requestItPass).not.toHaveBeenCalled();
    await act(async () => itButton().click());
    expect(requestItPass).toHaveBeenCalledTimes(1);
    // The full address at once (an installed web app can hand it to the IT app).
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith("https://it.example.test/#pass=one-time_pass", "_blank");
    expect(window.open.mock.calls[0][0]).not.toContain("?");
    expect(tab.opener).toBeNull();
  });

  test("a refused pass (403) opens nothing and takes the button away", async () => {
    requestItPass.mockResolvedValue(null);
    await mount();
    await openMenu();
    await act(async () => itButton().click());
    expect(window.open).not.toHaveBeenCalled();
    await openMenu();
    expect(itButton()).toBeUndefined();
  });
});

test.each([
  ["IT with no everyday role", { ...IT_USER, roles: [], role: undefined }],
  ["the system account", { firstname: "ا", lastname: "ن", isSystem: true }],
])("«قسم الIT» is offered to %s", async (_, user) => {
  getMe.mockResolvedValue(user);
  await mount();
  await openMenu();
  expect(itButton()).toBeDefined();
});


SOURCE: apps/system/src/Components/Routes/NavigationHistory.test.js

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../utils/unsavedChanges", () => ({ confirmLeave: jest.fn() }));
jest.mock("../../utils/session", () => ({ getStoredPermissions: () => ["students.view", "lessons.view", "lessons.edit", "reports.create"] }));
import { confirmLeave } from "../../utils/unsavedChanges";
import NavigationHistory from "./NavigationHistory";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
function Probe() {
  const location = useLocation(), navigate = useNavigate();
  return <><p data-testid="at">{location.pathname}{location.search}</p><button onClick={() => navigate("/students/one")}>record</button></>;
}
const mount = async (initial = "/students?filter=pending") => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[initial]}><NavigationHistory /><Probe /></MemoryRouter>));
};
const back = () => host.querySelector('nav button:first-child');
const forward = () => host.querySelector('nav button:last-child');
const at = () => host.querySelector('[data-testid="at"]').textContent;
beforeEach(() => { confirmLeave.mockResolvedValue(true); jest.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); });
test("internal back and forward restore the previous query and obey unsaved confirmation", async () => {
  await mount();
  expect(forward().disabled).toBe(true);
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === "record").click());
  confirmLeave.mockResolvedValueOnce(false);
  await act(async () => back().click());
  expect(at()).toBe("/students/one");
  await act(async () => back().click());
  expect(at()).toBe("/students?filter=pending");
  expect(forward().disabled).toBe(false);
  await act(async () => forward().click());
  expect(at()).toBe("/students/one");
});
test("a directly opened edit page returns to its record, with no forward entry or external navigation", async () => {
  await mount("/lessons/one/edit");
  expect(forward().disabled).toBe(true);
  await act(async () => back().click());
  expect(at()).toBe("/lessons/one");
  expect(forward().disabled).toBe(true);
});


SOURCE: apps/system/src/utils/navigationHistory.test.js

import { initialHistory, parentDestination, recordLocation, restorePageScroll } from "./navigationHistory";
const page = (key, pathname, search = "") => ({ key, pathname, search, state: { filter: "active" } });
test("scroll restoration waits for a loading list and stops if the person interacts", () => {
  let resize;
  const handlers = new Map();
  const disconnect = jest.fn();
  const win = { innerHeight: 600, scrollTo: jest.fn(), setTimeout: jest.fn(), clearTimeout: jest.fn(),
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() { disconnect(); } },
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: (name) => handlers.delete(name),
  };
  const doc = { documentElement: { scrollHeight: 600 }, body: { scrollHeight: 600 } };
  restorePageScroll({ x: 0, y: 700 }, win, doc);
  expect(win.scrollTo).not.toHaveBeenCalled();
  doc.body.scrollHeight = 1500; resize();
  expect(win.scrollTo).toHaveBeenCalledWith(0, 700);
  expect(disconnect).toHaveBeenCalled();
  win.scrollTo.mockClear(); doc.body.scrollHeight = 600;
  restorePageScroll({ x: 0, y: 700 }, win, doc);
  handlers.get("wheel")(); doc.body.scrollHeight = 1500; resize();
  expect(win.scrollTo).not.toHaveBeenCalled();
});
test("push/back/forward retain filters; a new branch discards the abandoned forward destination", () => {
  const a = page("a", "/students", "?filter=pending");
  const b = page("b", "/students/1");
  let history = recordLocation(initialHistory(a), b, "PUSH");
  history = recordLocation(history, a, "POP");
  expect(history.index).toBe(0);
  expect(history.entries[0].search).toBe("?filter=pending");
  history = recordLocation(history, b, "POP");
  expect(history.index).toBe(1);
  history = recordLocation(history, a, "POP");
  history = recordLocation(history, page("c", "/reports"), "PUSH");
  expect(history.entries.map((entry) => entry.key)).toEqual(["a", "c"]);
});
test("replace stays in the same history slot, and an unknown pop starts a new app boundary", () => {
  let history = initialHistory(page("a", "/students"));
  history = recordLocation(history, page("b", "/students", "?tab=waiting"), "REPLACE");
  expect(history.entries).toHaveLength(1);
  history = recordLocation(history, page("unknown", "/dashboard"), "POP");
  expect(history.index).toBe(0);
  expect(history.entries).toHaveLength(1);
});
test.each([["/lessons/abc/edit", "/lessons/abc"], ["/students/new", "/students"], ["/weekly-tasks/manage", "/weekly-tasks"], ["/lessons", "/dashboard"]])("direct entry %s has an internal parent", (path, parent) => {
  expect(parentDestination(path)).toBe(parent);
});
