import React, { useState } from "react";
import styles from "./LockedScreen.module.css";
import { canStored } from "../utils/session";

// Shown instead of an item that another tab holds. The screen opens the item
// by itself when the lock is released (useItemLock re-tries).
export default function LockedScreen({ holder, onForceRelease }) {
  const [busy, setBusy] = useState(false);
  const name = holder?.name || "مستخدم آخر";
  const tz = holder?.tz ? ` (${holder.tz})` : "";
  const canForce = typeof onForceRelease === "function" && canStored("permissions.manage");

  const force = async () => {
    setBusy(true);
    try {
      await onForceRelease();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap} role="status">
      <div className={styles.icon} aria-hidden="true">🔒</div>
      <p className={styles.text}>مفتوح الآن لدى {name}{tz}</p>
      {canForce && (
        <button type="button" className={styles.btn} onClick={force} disabled={busy}>
          تحرير القفل
        </button>
      )}
    </div>
  );
}
