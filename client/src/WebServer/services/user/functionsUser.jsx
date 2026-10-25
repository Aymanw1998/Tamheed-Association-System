// 📁 src/WebServer/services/user/functionsUser.js
import { fromJSON } from "postcss";
import { ask } from "../../../Components/Provides/confirmBus";
import api, { publicApi } from "../api";
import { normalizeRoles } from "../../../utils/session";

// ملاحظة عربية
const normalizeUser = (user) => {
  if (!user) return null;
  return {
    ...user,
    roles: normalizeRoles(user.roles),
  };
};

const extractUser = (data) => normalizeUser(data?.user ?? data ?? null);
/**
 * 
 * ملاحظة عربية
 * ملاحظة عربية
 * ملاحظة عربية
 * 
 * @returns 
 */
// Approving (waiting -> active, or activating a user with no role) needs `role`.
export const changeStatus = async (tz, from, to, role) => {
  try {
    const {status, data} = await api.post(`/user/changeStatus/${tz}`, role ? {from, to, role} : {from, to});
    if (![200,201].includes(status) || !data?.ok) throw new Error('تعذّر تغيير حالة المستخدم');
    return { ok: true, message: data.message};
  }catch(err) {
    return {ok: false, code: err.response?.data?.code, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
  }
}
/* ملاحظة عربية */
export const getAll = async (rooms = null) => {
  try{
    const {status, data} = await api.get('/user/', rooms ? {rooms} : {});
    if (![200,201].includes(status) || !data?.ok) throw new Error('لا يوجد مستخدمون');
    return {ok: true, users: (data.users || []).map(normalizeUser)};
  } catch(err) {
    return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
  }
};

/* ملاحظة عربية */
export const getUserById = async (tzOrId, {publicMode = false} = {}) => {
  try {
    const res = publicMode ? await publicApi.get(`/user/public/${tzOrId}`) : await api.get(`/user/${tzOrId}`);
    const {status, data} = res;
    if (![200,201].includes(status) || !data?.ok) throw new Error('لا يوجد مستخدم بالمعرّف: ' + tzOrId);
    return {ok: true, user: normalizeUser(data.user)};
  } catch (err) {
    return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
  }
};

/* ملاحظة عربية */
export const create = async (payload, {confirm = true} = {}) => {
  if(confirm) {
            const ok = await ask("create");
            if(!ok) {
                return null;
            }
        }
  try {
    const {status, data} = await api.post("/user/", payload);
    if (![200,201].includes(status) || !data?.ok) throw new Error('تعذّر إنشاء المستخدم');
    return { ok: true, user: extractUser(data) };
  } catch (err) {
    return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
  }
};

/* ملاحظة عربية */
export const update = async (tz, petch, {confirm = true} = {}) => {
  if(confirm) {
            const ok = await ask("change");
            if(!ok) {
                return null;
            }
        }
  try {
    const {status, data} = await api.put(`/user/${tz}`, petch);
    if (![200,201].includes(status) || !data?.ok) throw new Error('تعذّر تحديث بيانات المستخدم');
    return { ok: true, user: extractUser(data.user) };
  } catch (err) {
    return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
  }
};

export const uploadPhoto = async(tz, file) => {
    try{
        const formData = new FormData();
        formData.append('file', file);
        const { data, status } = await api.post(`/user/upload-photo/${encodeURIComponent(tz)}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تعذّر رفع الصورة');
        return {ok: true, photo: data.photo}
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

export const deletePhoto = async(tz) => {
    try {
        const { data, status } = await api.delete(`/user/photo/${encodeURIComponent(tz)}`);
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تعذّر حذف الصورة');
        return {ok: true, photo: data.photo};
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

/* ملاحظة عربية */
// `from` is the room the user is in; the edit page only shows active users.
export const deleteU = async (tz, from = "active", {confirm = true} = {}) => {
  if(confirm) {
            const ok = await ask("delete");
            if(!ok) {
                return null;
            }
        }
  try {
    const {status, data} = await api.delete(`/user/${tz}/${from}`);
    if (![200,201].includes(status) || !data?.ok) throw new Error ('تعذّر حذف المستخدم');
    return { ok: true, user: null };
  } catch (err) {
    return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
  }
};

/* ملاحظة عربية */
export const addSub = async (userId, subId, start, end) => {

  try {
    const {status, data} = await api.post(`/user/addSub/${userId}/${subId}`, {start, end});
    if (![200,201].includes(status) || !data?.ok) throw new Error('تعذّرت إضافة اشتراك للمستخدم');
    return { ok: true, user: extractUser(data.data) };
  } catch (err) {
    const msg = err?.response?.data?.message || err.message || "خطأ في إضافة الاشتراك";
    return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
  }
};


/* ملاحظة عربية */
export const removeSub = async (_userId) => {

  try {
    const {status, data} = await api.post(`/user/removeSub/${_userId}`);
    if (![200,201].includes(status) || !data?.ok) throw new Error('تعذّرت إزالة اشتراك المستخدم');
    return { ok: true, user: extractUser(data) };
  } catch (err) {
    const msg = err?.response?.data?.message || err.message || "خطأ في إزالة الاشتراك";
    return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
  }
};
export const viewPassword = async (tz) => {
  try {
    const {status, data} = await api.get(`/user/viewPassword/${tz}`);
    if (![200,201].includes(status) || !data?.ok) throw new Error('لا يمكن عرض كلمة المرور');
    return data;
  }
  catch (err) {
    return err.response.data;
  }
};

// Same contract as functionsNotice: never throws; failures carry the server's code.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    const body = err.response?.data || {};
    return { ok: false, status: err.response?.status || 0, code: body.code, message: body.message || err.message || 'تعذّر إتمام العملية.' };
  }
};
const userPath = (tz) => `/user/${encodeURIComponent(tz)}`;

// permissions.manage: { role, grants, revokes, effective, defaults, grantable, updatedAt, updatedBy }
export const getUserPermissions = (tz) => call(() => api.get(`${userPath(tz)}/permissions`));
// Full lists; 400 codes FORBIDDEN / NOT_GRANTABLE / SELF / UNKNOWN_KEY.
export const saveUserPermissions = (tz, { grants, revokes }) =>
  call(() => api.put(`${userPath(tz)}/permissions`, { grants, revokes }));
// users.changeRole: { ok, role, demoted }; 400 UNKNOWN_ROLE.
export const changeUserRole = (tz, role) => call(() => api.put(`${userPath(tz)}/role`, { role }));
// users.unlock: clears the failed sign-in counter and the lock.
export const unlockUser = (tz) => call(() => api.post(`${userPath(tz)}/unlock`, {}));
// systemRecovery.reset: emails a temporary password to the system mailbox.
// 409 RECOVERY_NOT_ALLOWED (under 3 failed sign-ins), 429 cooldown/rate limit.
export const recoverSystemAccount = () => call(() => api.post("/user/system/recover", {}));
