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
      message: body.message || err.message || "تعذّر إتمام العملية.",
      errors: body.errors || {},
    };
  }
};

const enc = encodeURIComponent;

export const getSports = () => call(() => api.get(namespace));
export const createSport = (payload) => call(() => api.post(namespace, payload));
export const updateSport = (id, payload) => call(() => api.put(`${namespace}/${enc(id)}`, payload));
export const deleteSport = (id) => call(() => api.delete(`${namespace}/${enc(id)}`));

export const getCoaches = () => call(() => api.get(`${namespace}/coaches`));

export const getTeams = () => call(() => api.get(`${namespace}/teams`));
export const createTeam = (payload) => call(() => api.post(`${namespace}/teams`, payload));
export const updateTeam = (id, payload) => call(() => api.put(`${namespace}/teams/${enc(id)}`, payload));
export const deleteTeam = (id) => call(() => api.delete(`${namespace}/teams/${enc(id)}`));
export const setTeamMembers = (id, studentIds) =>
  call(() => api.put(`${namespace}/teams/${enc(id)}/members`, { studentIds }));

export const getPlayers = () => call(() => api.get(`${namespace}/players`));
export const searchStudents = (q) => call(() => api.get(`${namespace}/students/search`, { params: { q } }));
export const savePlayer = (studentId, sportId, payload) =>
  call(() => api.put(`${namespace}/players/${enc(studentId)}/${enc(sportId)}`, payload));
export const deletePlayer = (studentId, sportId) =>
  call(() => api.delete(`${namespace}/players/${enc(studentId)}/${enc(sportId)}`));

export const getTrainings = (teamId) => call(() => api.get(`${namespace}/teams/${enc(teamId)}/trainings`));
export const createTraining = (teamId, payload) =>
  call(() => api.post(`${namespace}/teams/${enc(teamId)}/trainings`, payload));
export const updateTraining = (id, payload) => call(() => api.put(`${namespace}/trainings/${enc(id)}`, payload));
export const deleteTraining = (id) => call(() => api.delete(`${namespace}/trainings/${enc(id)}`));
