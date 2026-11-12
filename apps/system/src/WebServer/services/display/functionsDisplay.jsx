import api, { publicApi } from "../api";

// Wall display screens (owner, 2026-11-12).

// Public: the TV page never signs in, so this uses publicApi. Only a 410
// means the link is closed; any other failure keeps the last program.
export const fetchDisplayFeed = async (token) => {
  try {
    const { data } = await publicApi.post("/displays/feed", { token });
    return data && data.ok && data.feed ? { ok: true, feed: data.feed } : { ok: false };
  } catch (err) {
    return err && err.response && err.response.status === 410 ? { ok: false, closed: true } : { ok: false };
  }
};

// Management (displays.manage). Each call answers the server's JSON, or
// { ok: false, message } when the request failed.
const call = async (request, fallback) => {
  try {
    const { data } = await request();
    return data;
  } catch (err) {
    const data = (err && err.response && err.response.data) || {};
    return { ok: false, code: data.code, message: data.message || fallback };
  }
};

export const listDisplays = () => call(() => api.get("/displays"), "تعذّر تحميل الشاشات");
export const createDisplay = (body) => call(() => api.post("/displays", body), "تعذّر إضافة الشاشة");
export const updateDisplay = (id, patch) => call(() => api.put(`/displays/${id}`, patch), "تعذّر حفظ الشاشة");
export const rotateDisplayLink = (id) => call(() => api.post(`/displays/${id}/rotate`), "تعذّر إنشاء رابط جديد");
export const deleteDisplay = (id) => call(() => api.delete(`/displays/${id}`), "تعذّر حذف الشاشة");

// The secret goes after "#", so it never reaches the server in a URL.
export const displayLink = (token) => `${window.location.origin}/display#${token}`;
