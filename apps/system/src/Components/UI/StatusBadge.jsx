import React from "react";
import styles from "./StatusBadge.module.css";

const TONE_CLASS = {
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
  info: styles.info,
  neutral: styles.neutral,
};

export default function StatusBadge({ tone = "neutral", children, className = "" }) {
  const toneClass = TONE_CLASS[tone] || TONE_CLASS.neutral;

  return (
    <span className={`${styles.badge} ${toneClass} ${className}`}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
