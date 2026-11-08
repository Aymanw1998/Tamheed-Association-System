import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import Icon from "../UI/Icon";
import NewBadge from "../../tours/NewBadge";
import styles from "./BottomNav.module.css";

// The phone's bottom bar (package B, 2026-11-08): up to four everyday places
// one tap away, and "المزيد" for the full menu. Only places the user may open
// are passed in (Header filters them with the same rules as the menu).
export default function BottomNav({ items, onNav, onMore, moreOpen, moreLabel = "المزيد" }) {
  const { pathname } = useLocation();
  useEffect(() => {
    document.body.classList.add("has-bottom-nav");
    return () => document.body.classList.remove("has-bottom-nav");
  }, []);
  const shown = items.slice(0, 4);
  const isActive = (path) => pathname === path || pathname.startsWith(`${path}/`);
  return createPortal(
    <nav className={styles.bar} aria-label="التنقل السريع" dir="rtl">
      {shown.map((item) => (
        <a key={item.path} href={item.path} data-tour={item.tour ? `bottom-${item.tour}` : undefined}
          className={`${styles.item} ${isActive(item.path) ? styles.on : ""}`}
          aria-current={isActive(item.path) ? "page" : undefined}
          onClick={(event) => onNav(event, item.path)}>
          <span className={styles.icon}><Icon name={item.icon} size={22} />{item.badge && <span className={styles.badge}><NewBadge section={item.badge} /></span>}</span>
          <span className={styles.label}>{item.label}</span>
        </a>
      ))}
      <button type="button" className={`${styles.item} ${moreOpen ? styles.on : ""}`} aria-expanded={moreOpen} aria-controls="main-nav"
        onClick={(event) => { event.stopPropagation(); onMore(); }}>
        <span className={styles.icon}><Icon name="menu" size={22} /></span>
        <span className={styles.label}>{moreLabel}</span>
      </button>
    </nav>,
    document.body,
  );
}
