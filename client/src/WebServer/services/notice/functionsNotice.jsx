import api from "../api";

const namespace = "/notices";

// Same contract as functionsVehicle: never throws.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    const body = err.response?.data || {};
    return { ok: false, status: err.response?.status || 0, message: body.message || err.message || "تعذّر إتمام العملية.", errors: body.errors || {} };
  }
};

export const getNotices = (params = {}) => call(() => api.get(namespace, { params }));
export const getUnreadCount = () => call(() => api.get(`${namespace}/unread-count`));
export const createNotice = (payload) => call(() => api.post(namespace, payload));
export const markNoticeRead = (id) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/read`, {}));
export const markAllNoticesRead = () => call(() => api.post(`${namespace}/read-all`, {}));
export const archiveNotice = (id) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/archive`, {}));
export const runVehicleCheck = () => call(() => api.post(`${namespace}/run-vehicle-check`, {}, { timeout: 120000 }));
