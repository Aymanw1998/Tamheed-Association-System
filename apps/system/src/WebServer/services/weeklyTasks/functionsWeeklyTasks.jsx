import api from "../api";

const namespace = "/weekly-tasks";

// Never throws: { ok, ... } or { ok: false, message }.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    return { ok: false, status: err.response?.status || 0, code: err.response?.data?.code || "", message: err.response?.data?.message || "تعذّر إتمام العملية." };
  }
};

export const getMyTasks = () => call(() => api.get(`${namespace}/me`));
export const setMyTaskDone = (taskId, groupId, done, week) => call(() => api.post(`${namespace}/me/${encodeURIComponent(taskId)}`, { groupId, done, week }));
export const markPraiseSeen = (week) => call(() => api.post(`${namespace}/me/praise-seen`, { week }));
export const sendGreeting = (body) => call(() => api.post(`${namespace}/greetings`, body));
export const getTaskBoard = () => call(() => api.get(`${namespace}/board`));
export const addTask = (task) => call(() => api.post(namespace, task));
export const editTask = (id, task) => call(() => api.put(`${namespace}/${encodeURIComponent(id)}`, task));
export const removeTask = (id) => call(() => api.delete(`${namespace}/${encodeURIComponent(id)}`));
export const assignTask = (id, guideId) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/assign/${encodeURIComponent(guideId)}`, {}));
export const unassignTask = (id, guideId) => call(() => api.delete(`${namespace}/${encodeURIComponent(id)}/assign/${encodeURIComponent(guideId)}`));
export const approveTask = (id, guideId, approved, week) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/approve/${encodeURIComponent(guideId)}`, { approved, week }));
