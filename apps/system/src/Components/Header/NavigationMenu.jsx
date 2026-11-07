import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import NewBadge from "../../tours/NewBadge";
import styles from "./NavigationMenu.module.css";

const activeAt = (item, path) => item.path === "/lessons" ? /^\/(lessons|calendar)(\/|$)/.test(path) : path === item.path || path.startsWith(`${item.path}/`);

export default function NavigationMenu({ groups, program, home, mobile, open, onClose, onNav }) {
  const { pathname } = useLocation();
  const nav = useRef(null);
  const triggers = useRef({});
  const activeGroup = groups.find((group) => group.items.some((item) => activeAt(item, pathname)))?.id || null;
  const [expanded, setExpanded] = useState(mobile ? activeGroup : null);
  useEffect(() => { setExpanded(mobile ? activeGroup : null); onClose(); }, [pathname, mobile]); // close after route changes
  useEffect(() => {
    const outside = (event) => {
      if (nav.current && !nav.current.contains(event.target)) {
        setExpanded(null);
        if (mobile && open) onClose();
      }
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [mobile, open, onClose]);
  useEffect(() => {
    if (!mobile || !open) return undefined;
    setExpanded(activeGroup);
    const previous = document.querySelector('[data-tour="menu-toggle"]') || document.activeElement;
    nav.current?.querySelector("button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The old phone layout opens below the header. Measure its actual bottom:
    // long names, landscape and text zoom must leave the menu scrollable.
    const header = nav.current?.closest("header");
    const measure = () => nav.current?.style.setProperty("--navigation-header-bottom", `${header?.getBoundingClientRect().bottom || 120}px`);
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (header) observer?.observe(header);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect(); window.removeEventListener("resize", measure);
      document.body.style.overflow = previousOverflow; previous?.focus?.();
    };
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
    <div ref={nav} className={`${styles.shell} ${mobile ? styles.mobileMenu : ""}`} hidden={mobile && !open}
      role={mobile && open ? "dialog" : undefined} aria-modal={mobile && open ? "true" : undefined}
      aria-label={mobile ? "القائمة الرئيسية" : undefined} onKeyDown={onKey}
      onBlur={(event) => { if (!mobile && !event.currentTarget.contains(event.relatedTarget)) setExpanded(null); }}>
      {mobile && <div className={styles.menuHeading}><strong>القائمة الرئيسية</strong><button type="button" onClick={onClose} aria-label="إغلاق القائمة">×</button></div>}
      <nav id="main-nav" data-tour="menu" aria-label="التنقل الرئيسي" className={styles.nav}>
        {home && <div className={styles.shortcut}>{link(home)}</div>}
        {program && <div className={styles.shortcut}>{link(program)}</div>}
        {!mobile && groups.flatMap((group) => group.items).map(link)}
        {mobile && groups.map((group) => <div key={group.id} className={styles.group}>
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
