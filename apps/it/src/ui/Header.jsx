import ThemeSwitch from "./ThemeSwitch";
import { useEffect, useRef, useState } from "react";
import { Link, navigate } from "../router.jsx";
import logo from "../logo.png";
import styles from "./Header.module.css";

const PHONE = "(max-width: 768px)";
const isPhone = () => typeof window.matchMedia === "function" && window.matchMedia(PHONE).matches;

// The everyday app's header (apps/system/src/Components/Header): the logo,
// the title, the user's name with a small menu, and the page links (a menu
// button on phones). «النظام» stays a button of its own.
export default function Header({ links, path, me, onOpenSystem, onSignOut }) {
  const [phone, setPhone] = useState(isPhone);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(PHONE);
    const onChange = () => { setPhone(query.matches); setMenuOpen(false); };
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  // A link was followed: the phone menu closes.
  useEffect(() => { setMenuOpen(false); }, [path]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const onDocClick = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [accountOpen]);

  const isActive = (to) => path === to || (to === "/" && path.startsWith("/users"));
  const label = `${me.name} - ${me.isSystem ? "النظام" : "IT"}`;

  const account = (
    <div className={styles.account} ref={accountRef} onKeyDown={(event) => event.key === "Escape" && setAccountOpen(false)}>
      <button
        type="button"
        className={styles.userBadge}
        aria-haspopup="menu"
        aria-expanded={accountOpen}
        aria-controls="account-menu"
        onClick={() => setAccountOpen((value) => !value)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {accountOpen && (
        <div id="account-menu" role="menu" className={styles.accountMenu}>
          {/* «النظام»: the everyday app, signed in (owner, 2026-11-03: inside the name's menu). */}
          {onOpenSystem && (
            <button type="button" role="menuitem" data-testid="system-site-button" className={styles.switchSite} onClick={() => { setAccountOpen(false); onOpenSystem(); }}>
              <span className={styles.switchIcon} aria-hidden="true">⇄</span>
              <span className={styles.switchText}>
                <strong>النظام</strong>
                <small>الانتقال إلى النظام اليومي</small>
              </span>
            </button>
          )}
          <ThemeSwitch />
          <button type="button" role="menuitem" onClick={onSignOut} className={styles.logoutButton}>تسجيل الخروج</button>
        </div>
      )}
    </div>
  );

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <a href="/" title="المستخدمون" onClick={(event) => { event.preventDefault(); setMenuOpen(false); navigate("/"); }}>
          <img src={logo} alt="المستخدمون" className={styles.logo} />
        </a>
        <span className={styles.title}>جمعية تمهيد - قسم IT</span>
        {!phone && account}
      </div>

      {phone && (
        <div className={styles.headerContent}>
          <button
            type="button"
            className={styles.menuToggle}
            aria-label="فتح القائمة"
            aria-controls="main-nav"
            aria-expanded={menuOpen}
            onClick={(event) => { event.stopPropagation(); setMenuOpen((value) => !value); }}
          >
            <span />
            <span />
            <span />
          </button>
          {account}
        </div>
      )}

      {phone && menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} />}

      <nav
        id="main-nav"
        aria-label="القائمة"
        className={`${styles.navbarV} ${phone ? styles.mobileNav : ""}`}
        data-open={phone ? menuOpen : true}
      >
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={isActive(link.to) ? styles.active : ""}
            aria-current={isActive(link.to) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
