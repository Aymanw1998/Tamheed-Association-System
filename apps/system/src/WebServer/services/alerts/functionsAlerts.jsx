import api from "../api";

// The signed-in user's own alert inbox (server/Entities/Alert/Alert.route.js).

export async function listAlerts() {
  const { data } = await api.get("/alerts");
  return Array.isArray(data?.alerts) ? data.alerts : [];
}

export async function markAlertRead(id) {
  await api.post(`/alerts/${encodeURIComponent(id)}/read`);
}

export async function markAllAlertsRead() {
  await api.post("/alerts/read-all");
}
