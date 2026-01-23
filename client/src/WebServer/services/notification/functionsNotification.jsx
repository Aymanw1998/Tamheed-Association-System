import api from "../api";
export const getNotifications = async ({ unreadOnly = false } = {}) => {
  const res = await api.get(`/notifications`, {
    params: { unreadOnly: unreadOnly ? 1 : 0 },
  });
  return res.data; // { ok, notifications, unreadCount }
};

export const markNotificationRead = async (id) => {
  const res = await api.put(`/notifications/${id}/read`);
  return res.data;
};

export const markAllNotificationsRead = async () => {
  const res = await api.put(`/notifications/read-all`);
  return res.data;
};