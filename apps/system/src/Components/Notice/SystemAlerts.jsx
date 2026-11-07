import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAlertPage, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
import { liveEvents } from "../../WebServer/services/live/liveStream";
import { getNotices, markNoticeRead } from "../../WebServer/services/notice/functionsNotice.jsx";
import useLiveRefresh from "../../locks/useLiveRefresh";
import { alertTarget, alertText, alertTime, normalizeAlert } from "../../utils/alertDisplay";
import styles from "./Notice.module.css";

// The signed-in user's system alerts on the board, past the three the bell shows.
export default function SystemAlerts({ title = "رسائل النظام", showEmpty = false, includeNotices = false }) {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [notices, setNotices] = useState([]);
  const [noticeOffset, setNoticeOffset] = useState(0);
  const [moreNotices, setMoreNotices] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const pending = useRef(false);

  const load = useCallback(async (skip = 0, noticeSkip = 0, append = false) => {
    if (append && pending.current) return;
    const request = ++generation.current;
    pending.current = true;
    setLoading(true); setError("");
    try {
      const [page, board] = await Promise.all([
        getAlertPage(skip),
        includeNotices ? getNotices({ status: "all", skip: noticeSkip }) : Promise.resolve({ ok: true, notices: [] }),
      ]);
      if (request !== generation.current) return;
      if (!board.ok) throw new Error("Notices unavailable");
      const list = page.alerts.map(normalizeAlert);
      setAlerts((previous) => [...new Map([...(append ? previous : []), ...list].map((alert) => [alert.id, alert])).values()]);
      const boardItems = (board.notices || []).map((notice) => ({ id: String(notice._id), kind: "notice", text: { ar: notice.title }, at: notice.createdAt, read: Boolean(notice.read), link: "/notices" }));
      setNotices((previous) => [...new Map([...(append ? previous : []), ...boardItems].map((notice) => [notice.id, notice])).values()]);
      setNoticeOffset(noticeSkip + boardItems.length);
      setMoreNotices(boardItems.length === 200);
      setTotal(page.total);
      setOffset(list.length ? skip + list.length : page.total);
    } catch {
      if (request === generation.current) setError("تعذّر تحميل الإشعارات. حاول مرة أخرى.");
    } finally {
      if (request === generation.current) { pending.current = false; setLoading(false); }
    }
  }, [includeNotices]);
  useLiveRefresh(["notice"], () => load(0));
  useEffect(() => {
    const refresh = () => load(0);
    refresh();
    const unsubscribe = liveEvents.on("alert", refresh);
    window.addEventListener("NOTICES_CHANGED", refresh);
    return () => { ++generation.current; unsubscribe(); window.removeEventListener("NOTICES_CHANGED", refresh); };
  }, [load]);

  const items = [...alerts, ...(includeNotices ? notices : [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!showEmpty && !items.length && !error && !loading) return null;

  const open = async (alert) => {
    if (!alert.read) {
      const setRows = alert.kind === "notice" ? setNotices : setAlerts;
      setRows((prev) => prev.map((row) => (row.id === alert.id ? { ...row, read: true } : row)));
      if (alert.kind === "notice") await markNoticeRead(alert.id).catch(() => {});
      else await markAlertRead(alert.id).catch(() => {});
      window.dispatchEvent(new Event("NOTICES_CHANGED"));
    }
    const target = alertTarget(alert.link);
    if (target?.external) window.open(target.external, "_blank", "noopener,noreferrer");
    else if (target?.path) navigate(target.path);
  };

  return (
    <section className={styles.systemAlerts} aria-label={title}>
      <h2>{title}</h2>
      {error && <p role="alert">{error}<button type="button" onClick={() => load(0)}>إعادة المحاولة</button></p>}
      {!loading && !error && !items.length && <p>لا توجد إشعارات.</p>}
      <ul aria-label="قائمة الإشعارات" tabIndex={0}>
        {items.map((alert) => (
          <li key={`${alert.kind || "alert"}:${alert.id}`}>
            <button type="button" className={`${styles.bellItem} ${alert.read ? "" : styles.bellUnread}`} onClick={() => open(alert)}>
              <span dir="auto">{alertText(alert)}</span>
              <small>{alertTime(alert.at)}</small>
            </button>
          </li>
        ))}
        {(offset < total || moreNotices) && <li><button type="button" disabled={loading} onClick={() => load(offset, noticeOffset, true)}>عرض إشعارات أقدم</button></li>}
      </ul>
      {loading && <small role="status">جارٍ تحميل الإشعارات…</small>}
    </section>
  );
}
