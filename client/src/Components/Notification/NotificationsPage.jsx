import React, { useEffect, useMemo, useState } from "react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../WebServer/services/notification/functionsNotification.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await getNotifications({ unreadOnly });
      if (!res?.ok) throw new Error(res?.message || "Failed");
      setItems(res.notifications || []);
    } catch (e) {
      toast.error(e.message || "خطأ في تحميل الاشعارات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [unreadOnly]);

  const unreadCount = useMemo(
    () => items.filter((x) => !x.readAt).length,
    [items]
  );

  const onRead = async (id) => {
    try {
      const res = await markNotificationRead(id);
      if (!res?.ok) throw new Error(res?.message || "Failed");
      setItems((prev) => prev.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    } catch (e) {
      toast.error(e.message || "فشل وضع كمقروء");
    }
  };

  const onReadAll = async () => {
    try {
      const res = await markAllNotificationsRead();
      if (!res?.ok) throw new Error(res?.message || "Failed");
      toast.success("✅ تم وضع الكل كمقروء");
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    } catch (e) {
      toast.error(e.message || "فشل");
    }
  };

  return (
    <div style={{ padding: 18, maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 10 }}>الإشعارات</h2>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => setUnreadOnly((v) => !v)}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: unreadOnly ? "#111827" : "white",
            color: unreadOnly ? "white" : "#111",
            cursor: "pointer",
          }}
        >
          {unreadOnly ? "عرض الكل" : "فقط غير مقروء"}
        </button>

        <button
          onClick={onReadAll}
          disabled={unreadCount === 0}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: unreadCount === 0 ? "#f3f4f6" : "#10b981",
            color: unreadCount === 0 ? "#6b7280" : "white",
            cursor: unreadCount === 0 ? "not-allowed" : "pointer",
          }}
        >
          وضع الكل كمقروء
        </button>

        <span style={{ marginLeft: "auto", opacity: 0.75 }}>
          غير مقروء: <b>{unreadCount}</b>
        </span>
      </div>

      {loading ? (
        <div>تحميل...</div>
      ) : items.length === 0 ? (
        <div style={{ opacity: 0.7 }}>لا يوجد إشعارات.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((n) => (
            <div
              key={n._id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                background: n.readAt ? "white" : "#fff7ed",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 800 }}>{n.title || "Notification"}</div>
                <div style={{ opacity: 0.6, fontSize: 12 }}>
                  {n.createdAt ? new Date(n.createdAt).toLocaleString("en-GB") : ""}
                </div>
                <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
                  {n.module} · {n.action}
                </div>
              </div>

              {n.message && <div style={{ marginTop: 8, lineHeight: 1.6 }}>{n.message}</div>}

              {/* {n.meta && (
                <pre
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 10,
                    background: "#f9fafb",
                    border: "1px solid #eee",
                    overflow: "auto",
                    fontSize: 12,
                    direction: "ltr",
                  }}
                >
                  {JSON.stringify(n.meta, null, 2)}
                </pre>
              )} */}

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                {!n.readAt && (
                  <button
                    onClick={() => onRead(n._id)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#111827",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    وضع كمقروء
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
