import React, { useEffect, useState } from "react";
import { getNotifications } from "../../WebServer/services/notification/functionsNotification";
import { useNavigate } from "react-router-dom";

export default function NotificationsBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  const load = async () => {
    try {
      const res = await getNotifications({ unreadOnly: true });
      if (res?.ok) setUnread(res.unreadCount ?? res.notifications?.length ?? 0);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000); // كل 8 ثواني (بدون socket)
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        style={{
          border: "1px solid #ddd",
          background: "white",
          borderRadius: 10,
          padding: "8px 10px",
          cursor: "pointer",
        }}
        title="Notifications"
      >
        🔔
      </button>

      {unread > 0 && (
        <span
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 20,
            height: 20,
            padding: "0 6px",
            borderRadius: 999,
            background: "#ef4444",
            color: "white",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
          }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </div>
  );
}
