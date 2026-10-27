import React, { useCallback, useEffect, useState } from "react";
import { getUnreadCount } from "../../WebServer/services/notice/functionsNotice.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { fillText } from "../../utils/vehicleDisplay";
import styles from "./Notice.module.css";

const POLL_MS = 60 * 1000;

// Administrators only (the Header decides). Polls instead of SSE because the
// SSE stream is not permission-checked.
export default function NoticeBell({ onOpen }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => getUnreadCount().then((res) => res.ok && setCount(res.count || 0)), []);

  useEffect(() => {
    refresh();
    // A hidden tab does not poll; focus brings it up to date (focus within
    // 30 s is answered from memory, see WebServer/services/traffic.js).
    const id = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("NOTICES_CHANGED", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("NOTICES_CHANGED", refresh);
    };
  }, [refresh]);

  const label = fillText(t("notices.bell"), { n: count });
  return (
    <button type="button" className={styles.bell} onClick={onOpen} title={label} aria-label={label}>
      <span aria-hidden="true">🔔</span>
      {count > 0 && <span className={styles.badge}>{count > 99 ? "99+" : count}</span>}
    </button>
  );
}
