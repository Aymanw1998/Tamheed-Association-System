import api from "../api";

// The signed-in user's own alert inbox (server/Entities/Alert/Alert.route.js).

export async function listAlerts({ unread = false } = {}) {
  const { data } = await api.get("/alerts", unread ? { params: { unread: 1 } } : undefined);
  return Array.isArray(data?.alerts) ? data.alerts : [];
}

export async function getAlertPage(skip = 0, status = "active") {
  const { data } = await api.get("/alerts", { params: { skip, ...(status === "deleted" ? { status } : {}) } });
  if (data?.ok === false) throw new Error(data.message || "تعذّر تحميل الإشعارات");
  return { alerts: Array.isArray(data?.alerts) ? data.alerts : [], total: Number(data?.total) || 0 };
}
export const dismissAlert = (id, dismissed) => api.post(`/alerts/${encodeURIComponent(id)}/dismiss`, { dismissed });

// The server's own count: it sees past the 50 a list returns.
export async function countUnreadAlerts() {
  const { data } = await api.get("/alerts", { params: { unread: 1 } });
  return Number(data?.total) || 0;
}

export async function markAlertRead(id) {
  await api.post(`/alerts/${encodeURIComponent(id)}/read`);
}

export async function markAllAlertsRead() {
  await api.post("/alerts/read-all");
}
