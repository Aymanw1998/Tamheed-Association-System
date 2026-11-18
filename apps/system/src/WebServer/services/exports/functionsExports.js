import api from "../api";

// Excel exports (owner, 2026-11-16): managers only, each one written in the
// audit log. Every call resolves to { ok, ...data } or { ok: false, message }.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    const body = err.response?.data || {};
    return { ok: false, status: err.response?.status || 0, message: body.message || err.message || "تعذّر إتمام العملية." };
  }
};

// kind: "students" | "users". Asked before the file is made.
export const logExport = (kind, count) => call(() => api.post("/exports/log", { kind, count }));
// month: "YYYY-MM". The server logs it.
export const getProgramsSummary = (month) => call(() => api.get("/exports/programs", { params: { month } }));
