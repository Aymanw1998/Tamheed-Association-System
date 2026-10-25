import api from "../api";

const namespace = "/sports";

// Every call resolves to { ok, ...data } or { ok: false, message, errors, status }
// so pages never need their own try/catch around the network.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    const body = err.response?.data || {};
    return {
      ok: false,
      status: err.response?.status || 0,
      data: err.response?.data,
      message: body.message || err.message || "تعذّر إتمام العملية.",
      errors: body.errors || {},
    };
  }
};

const enc = encodeURIComponent;

// The sport (football) and its stat settings.
export const getSport = () => call(() => api.get(namespace));
export const setStats = (stats) => call(() => api.put(`${namespace}/stats`, { stats }));

// Players. Always send the full lessonIds list when saving: leaving it out
// removes the player from every lesson.
export const getPlayers = () => call(() => api.get(`${namespace}/players`));
export const searchStudents = (params) => call(() => api.get(`${namespace}/students/search`, { params }));
export const savePlayer = (studentId, payload) =>
  call(() => api.put(`${namespace}/players/${enc(studentId)}`, payload));
export const deletePlayer = (studentId) => call(() => api.delete(`${namespace}/players/${enc(studentId)}`));
export const bumpStat = (studentId, key, delta) =>
  call(() => api.post(`${namespace}/players/${enc(studentId)}/stats`, { key, delta }));

// Lessons.
export const getLessons = () => call(() => api.get(`${namespace}/lessons`));
export const createLesson = (payload) => call(() => api.post(`${namespace}/lessons`, payload));
export const updateLesson = (id, payload) => call(() => api.put(`${namespace}/lessons/${enc(id)}`, payload));
export const deleteLesson = (id) => call(() => api.delete(`${namespace}/lessons/${enc(id)}`));
// Any student can join a lesson; a student who is not yet a player becomes one.
export const addLessonPlayer = (lessonId, studentId) =>
  call(() => api.post(`${namespace}/lessons/${enc(lessonId)}/players`, { studentId }));
export const removeLessonPlayer = (lessonId, studentId) =>
  call(() => api.delete(`${namespace}/lessons/${enc(lessonId)}/players/${enc(studentId)}`));

// Attendance.
export const getAttendance = (lessonId, date) =>
  call(() => api.get(`${namespace}/lessons/${enc(lessonId)}/attendance`, { params: date ? { date } : {} }));
export const saveAttendance = (lessonId, date, marks) =>
  call(() => api.put(`${namespace}/lessons/${enc(lessonId)}/attendance`, { date, marks }));
export const getTodayLessons = () => call(() => api.get(`${namespace}/attendance/today`));
