import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNotices, getUnreadCount, markNoticeRead } from "../../WebServer/services/notice/functionsNotice.jsx";
import { countUnreadAlerts, listAlerts, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
import { liveEvents } from "../../WebServer/services/live/liveStream";
import { clearTraffic } from "../../WebServer/services/traffic";
import { alertTarget, alertText, alertTime, normalizeAlert } from "../../utils/alertDisplay";
import { useI18n } from "../../i18n/I18nContext";
import { fillText } from "../../utils/vehicleDisplay";
import styles from "./Notice.module.css";

const POLL_MS = 60 * 1000;
const SHOWN = 3;

const alertItem = (raw) => {
  const alert = normalizeAlert(raw);
  return { key: `alert:${alert.id}`, kind: "alert", id: alert.id, text: alertText(alert), at: alert.at, read: alert.read, link: alert.link };
};
const noticeItem = (notice) => ({
  key: `notice:${notice._id}`, kind: "notice", id: notice._id, text: notice.title, at: notice.createdAt, read: Boolean(notice.read), link: "/notices",
});

// Unread first, then newest.
export const bellOrder = (items) => [...items].sort((a, b) =>
  Number(a.read) - Number(b.read) || new Date(b.at).getTime() - new Date(a.at).getTime());

const noticesOf = (res) => (res.ok ? res.notices || [] : []);

// Everyone has the bell: personal system alerts (a new user, a parent's request,
// each by its own permission), plus the board's notices for those who may read
// them. A press opens a small window with the latest three, not another page.
// The badge asks the server for its counts, which see past the capped lists; the
// lists themselves load only when the window opens.
export default function NoticeBell({ canViewNotices = false }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const openRef = useRef(false);
  // An answer that left before a read was marked is older than it: dropped.
  const countAsked = useRef(0);
  const listAsked = useRef(0);

  const loadItems = useCallback(async () => {
    listAsked.current += 1;
    const asked = listAsked.current;
    const [alerts, unreadAlerts, notices, unreadNotices] = await Promise.all([
      listAlerts().catch(() => []),
      listAlerts({ unread: true }).catch(() => []),
      canViewNotices ? getNotices({ status: "all" }) : Promise.resolve({ ok: true }),
      canViewNotices ? getNotices({ status: "unread" }) : Promise.resolve({ ok: true }),
    ]);
    if (asked !== listAsked.current) return;
    const byKey = new Map();
    for (const item of [...alerts.map(alertItem), ...unreadAlerts.map(alertItem), ...noticesOf(notices).map(noticeItem), ...noticesOf(unreadNotices).map(noticeItem)]) {
      byKey.set(item.key, item);
    }
    setItems([...byKey.values()]);
  }, [canViewNotices]);

  const refresh = useCallback(async () => {
    countAsked.current += 1;
    const asked = countAsked.current;
    const [alerts, notices] = await Promise.all([
      countUnreadAlerts().catch(() => 0),
      canViewNotices ? getUnreadCount() : Promise.resolve({ ok: true, count: 0 }),
    ]);
    if (asked !== countAsked.current) return;
    setCount(alerts + (notices.ok ? notices.count || 0 : 0));
    if (openRef.current) loadItems();
  }, [canViewNotices, loadItems]);

  useEffect(() => {
    refresh();
    // A hidden tab does not poll; focus brings it up to date (focus within
    // 30 s is answered from memory, see WebServer/services/traffic.js).
    const id = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("NOTICES_CHANGED", refresh);
    const offAlert = liveEvents.on("alert", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("NOTICES_CHANGED", refresh);
      offAlert?.();
    };
  }, [refresh]);

  useEffect(() => {
    openRef.current = open;
    if (!open) return undefined;
    loadItems();
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loadItems]);

  const shown = bellOrder(items).slice(0, SHOWN);

  const markRead = async (item) => {
    countAsked.current += 1;
    listAsked.current += 1;
    setItems((prev) => prev.map((row) => (row.key === item.key ? { ...row, read: true } : row)));
    setCount((value) => Math.max(0, value - 1));
    try {
      if (item.kind === "alert") await markAlertRead(item.id);
      else await markNoticeRead(item.id);
    } catch { /* the next refresh tells the truth */ }
    clearTraffic();
    refresh();
  };

  const openItem = (item) => {
    setOpen(false);
    if (!item.read) markRead(item);
    const target = alertTarget(item.link);
    if (target?.external) window.open(target.external, "_blank", "noopener,noreferrer");
    else if (target?.path) navigate(target.path);
  };

  const label = fillText(t("notices.bell"), { n: count });
  return (
    <span ref={rootRef} className={styles.bellWrap}>
      <button type="button" className={styles.bell} onClick={() => setOpen((value) => !value)} title={label} aria-label={label} aria-expanded={open} aria-haspopup="dialog">
        <span aria-hidden="true">🔔</span>
        {count > 0 && <span className={styles.badge}>{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className={styles.bellPanel} role="dialog" aria-label={t("notices.bellTitle")}>
          <strong className={styles.bellTitle}>{t("notices.bellTitle")}</strong>
          {shown.length === 0 && <p className={styles.bellEmpty}>{t("notices.bellEmpty")}</p>}
          {shown.map((item) => (
            <button key={item.key} type="button" className={`${styles.bellItem} ${item.read ? "" : styles.bellUnread}`} onClick={() => openItem(item)}>
              <span dir="auto">{item.text}</span>
              <small><time dir="ltr">{alertTime(item.at)}</time></small>
            </button>
          ))}
          {canViewNotices && (
            <button type="button" className={styles.bellBoard} onClick={() => { setOpen(false); navigate("/notices"); }}>
              {t("notices.bellBoard")}
            </button>
          )}
        </div>
      )}
    </span>
  );
}
