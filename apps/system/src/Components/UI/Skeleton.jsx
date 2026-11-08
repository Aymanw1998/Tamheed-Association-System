import React from "react";
import styles from "./Skeleton.module.css";

// A loading placeholder shaped like the content it stands for (package A,
// 2026-11-08): shimmering bars instead of "…". The label is read by screen
// readers and kept in the page text, so "جارٍ التحميل…" stays findable.
export default function Skeleton({ rows = 5, label = "جارٍ التحميل…", variant = "table", className = "" }) {
  return (
    <div role="status" aria-live="polite" className={`${styles.wrap} ${className}`}>
      <span className="sr-only">{label}</span>
      {variant === "cards" ? (
        <div className={styles.cards} aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className={styles.card}>
              <span className={`${styles.bar} ${styles.title}`} />
              <span className={`${styles.bar} ${styles.big}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.table} aria-hidden="true">
          <span className={`${styles.bar} ${styles.head}`} />
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className={styles.row}>
              <span className={styles.bar} style={{ width: `${55 + ((i * 17) % 35)}%` }} />
              <span className={styles.bar} style={{ width: "18%" }} />
              <span className={styles.bar} style={{ width: "12%" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
