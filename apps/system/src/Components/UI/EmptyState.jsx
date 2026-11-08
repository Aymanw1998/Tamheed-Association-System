import React from "react";
import Icon from "./Icon";
import styles from "./EmptyState.module.css";

// An empty list that says what the place is for and what to try next
// (package B, 2026-11-08), instead of a bare "no data". `action` is an
// optional element (usually a Button).
export default function EmptyState({ icon = "inbox", title, hint, action, compact = false }) {
  return (
    <div className={`${styles.empty} ${compact ? styles.compact : ""}`}>
      <span className={styles.icon}><Icon name={icon} size={compact ? 22 : 28} /></span>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
