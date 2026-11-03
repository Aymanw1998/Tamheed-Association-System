import api from "../api";

// Same contract as functionsNotice: never throws.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    const body = err.response?.data || {};
    return { ok: false, status: err.response?.status || 0, code: body.code, message: body.message || err.message || "تعذّر إتمام العملية." };
  }
};

// audit.view. params: from, to (YYYY-MM-DD, Israel days), module, actor, action,
// targetId, q, page. Returns { items, total }, 50 per page; 400 BAD_DATE.
export const getAudit = (params = {}) => call(() => api.get("/audit", { params }));
