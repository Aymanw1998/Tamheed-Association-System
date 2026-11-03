import React from "react";
import styles from "./LockedScreen.module.css";

// Shown instead of an item that another tab holds. The screen opens the item
// by itself when the lock is released (useItemLock re-tries). Force-releasing
// a lock is an IT action, done on the IT site.
export default function LockedScreen({ holder }) {
  const name = holder?.name || "مستخدم آخر";
  const tz = holder?.tz ? ` (${holder.tz})` : "";

  return (
    <div className={styles.wrap} role="status">
      <div className={styles.icon} aria-hidden="true">🔒</div>
      <p className={styles.text}>مفتوح الآن لدى {name}{tz}</p>
    </div>
  );
}
