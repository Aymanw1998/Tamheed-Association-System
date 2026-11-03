import React from "react";
import { Link } from "react-router-dom";
import styles from "./RecordParts.module.css";

// Small read-only pieces shared by the record pages.

// A titled group of label/value rows; an empty value shows «—».
export function DetailGroup({ title, rows }) {
  return (
    <div className={styles.group}>
      {title && <h3 className={styles.groupTitle}>{title}</h3>}
      {rows.map(([label, value]) => (
        <div className={styles.row} key={label}>
          <span className={styles.key}>{label}</span>
          {/* bdi: a phone "+972…" or an email keeps its own order in the RTL page. */}
          <span className={styles.value}>{value || value === 0 ? <bdi>{value}</bdi> : "—"}</span>
        </div>
      ))}
    </div>
  );
}

// A list of linked rows (a lesson, a student); `empty` is shown when there are none.
// A row without `to` is plain text.
export function LinkList({ items, empty }) {
  if (!items.length) return <p className={styles.empty}>{empty}</p>;
  return (
    <ul className={styles.list}>
      {items.map((it) => {
        const body = (
          <>
            <span className={styles.itemName}>{it.name}</span>
            {it.badge && <span className={styles.badge} data-tone={it.badge.tone}>{it.badge.text}</span>}
            {it.meta && <span className={styles.itemMeta}>{it.meta}</span>}
          </>
        );
        return (
          <li key={it.key}>
            {it.to ? <Link className={styles.item} to={it.to}>{body}</Link> : <div className={styles.item}>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

// A guide's name (linked when `to` is set) and phone; `empty` when there is no guide.
export function GuideCard({ contact, to, empty, label }) {
  if (!contact) return <p className={styles.empty}>{empty}</p>;
  return (
    <div className={styles.guide}>
      {label && <span className={styles.key}>{label}</span>}
      {to ? <Link className={styles.guideName} to={to}>{contact.name}</Link> : <span className={styles.guideName}>{contact.name}</span>}
      {contact.phone && <a className={styles.phone} href={`tel:${contact.phone}`} dir="ltr">{contact.phone}</a>}
    </div>
  );
}
