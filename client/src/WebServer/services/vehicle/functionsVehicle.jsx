import api from "../api";

const namespace = "/vehicle";

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
      message: body.message || err.message || "يوجد خلل في العملية",
      errors: body.errors || {},
    };
  }
};

const base = (id) => `${namespace}/${encodeURIComponent(id)}`;

export const getMyPermissions = () => call(() => api.get(`${namespace}/me/permissions`));
export const getAlerts = () => call(() => api.get(`${namespace}/alerts`));
export const getResponsibles = () => call(() => api.get(`${namespace}/responsibles`));

export const getAllVehicles = () => call(() => api.get(namespace));
export const getVehicle = (id) => call(() => api.get(base(id)));
export const createVehicle = (payload) => call(() => api.post(namespace, payload));
export const updateVehicle = (id, payload) => call(() => api.put(base(id), payload));
export const archiveVehicle = (id, reason = "") => call(() => api.post(`${base(id)}/archive`, { reason }));
// Permanent delete (administrators only); the plate is sent back as confirmation.
export const deleteVehicle = (id, confirmPlate) =>
  call(() => api.delete(base(id), { data: { confirmPlate } }));
export const restoreVehicle = (id) => call(() => api.post(`${base(id)}/restore`, {}));
export const getVehicleAudit = (id) => call(() => api.get(`${base(id)}/audit`));

// Licences, tests and policies share one shape: add, correct, retire.
const recordCalls = (path, retirePath) => ({
  add: (id, payload) => call(() => api.post(`${base(id)}/${path}`, payload)),
  update: (id, recordId, payload) =>
    call(() => api.put(`${base(id)}/${path}/${encodeURIComponent(recordId)}`, payload)),
  retire: (id, recordId, reason) =>
    call(() => api.post(`${base(id)}/${path}/${encodeURIComponent(recordId)}/${retirePath}`, { reason })),
});

export const licenseApi = recordCalls("licenses", "void");
export const testApi = recordCalls("tests", "void");
export const policyApi = recordCalls("policies", "cancel");

export const setNextTestDate = (id, nextTestDate, reason = "") =>
  call(() => api.put(`${base(id)}/next-test`, { nextTestDate, reason }));

export const uploadVehicleDocument = (id, { file, kind, linkedType, linkedId, replacesId, title }) => {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind || "other");
  form.append("linkedType", linkedType || "vehicle");
  if (linkedId) form.append("linkedId", linkedId);
  if (replacesId) form.append("replacesId", replacesId);
  if (title) form.append("title", title);
  return call(() =>
    api.post(`${base(id)}/documents`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    })
  );
};

export const updateDocumentTitle = (id, docId, title) =>
  call(() => api.put(`${base(id)}/documents/${encodeURIComponent(docId)}`, { title }));
export const deleteDocument = (id, docId) =>
  call(() => api.delete(`${base(id)}/documents/${encodeURIComponent(docId)}`));

// Documents are never public links: the browser asks the server, which checks
// the permission and streams the file. The blob is opened from memory.
export const fetchVehicleDocument = async (id, docId, { inline = false } = {}) => {
  try {
    const response = await api.get(`${base(id)}/documents/${encodeURIComponent(docId)}/download`, {
      params: inline ? { inline: 1 } : {},
      responseType: "blob",
      timeout: 120000,
    });
    return { ok: true, blob: response.data };
  } catch (err) {
    let message = err.message;
    try {
      const text = await err.response?.data?.text?.();
      message = JSON.parse(text).message || message;
    } catch {
      // keep the generic message
    }
    return { ok: false, message };
  }
};

// A proposal from data.gov.il for the user to review; nothing is saved.
export const lookupOfficial = (plate) =>
  call(() => api.get(`${namespace}/official-lookup/${encodeURIComponent(plate)}`, { timeout: 20000 }));
