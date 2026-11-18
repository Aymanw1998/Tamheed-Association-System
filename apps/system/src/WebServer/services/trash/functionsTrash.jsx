import api from "../api";

// «سلة المحذوفات» (owner, 2026-11-16): deleted students, vehicles and staff,
// kept 30 days. Every call resolves to { ok, ...data } or { ok: false, message }.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    const body = err.response?.data || {};
    return { ok: false, status: err.response?.status || 0, message: body.message || err.message || "تعذّر إتمام العملية." };
  }
};

export const listTrash = () => call(() => api.get("/trash"));
export const restoreTrash = (id) => call(() => api.post(`/trash/${encodeURIComponent(id)}/restore`));
export const purgeTrash = (id) => call(() => api.delete(`/trash/${encodeURIComponent(id)}`));
