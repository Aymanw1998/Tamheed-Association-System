import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listAlerts, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
import { liveEvents } from "../../WebServer/services/live/liveStream";
import { alertTarget, alertText, alertTime, normalizeAlert } from "../../utils/alertDisplay";
import styles from "./Notice.module.css";

// The signed-in user's system alerts on the board, past the three the bell shows.
export default function SystemAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);

  const load = useCallback(() => listAlerts().then((list) => setAlerts(list.map(normalizeAlert))).catch(() => {}), []);
  useEffect(() => {
    load();
    return liveEvents.on("alert", load);
  }, [load]);

  if (!alerts.length) return null;

  const open = async (alert) => {
    if (!alert.read) {
      setAlerts((prev) => prev.map((row) => (row.id === alert.id ? { ...row, read: true } : row)));
      await markAlertRead(alert.id).catch(() => {});
      window.dispatchEvent(new Event("NOTICES_CHANGED"));
    }
    const target = alertTarget(alert.link);
    if (target?.external) window.open(target.external, "_blank", "noopener,noreferrer");
    else if (target?.path) navigate(target.path);
  };

  return (
    <section className={styles.systemAlerts} aria-label="رسائل النظام">
      <h2>رسائل النظام</h2>
      <ul>
        {alerts.map((alert) => (
          <li key={alert.id}>
            <button type="button" className={`${styles.bellItem} ${alert.read ? "" : styles.bellUnread}`} onClick={() => open(alert)}>
              <span dir="auto">{alertText(alert)}</span>
              <small>{alertTime(alert.at)}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
