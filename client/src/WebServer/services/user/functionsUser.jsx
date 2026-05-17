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
export const changeStatus = async (tz, from, to) => {
  try {
    const {status, data} = await api.post(`/user/changeStatus/${tz}`, {from, to});
    if (![200,201].includes(status) || !data?.ok) throw new Error('لم يتم تغيير حالة المستخدم');
    return { ok: true, message: data.message};
  }catch(err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  } 
}
/* ملاحظة عربية */
export const getAll = async (rooms = null) => {
  try{
    const {status, data} = await api.get('/user/', rooms ? {rooms} : {});
    if (![200,201].includes(status) || !data?.ok) throw new Error('لا يوجد مستخدمون');
    return {ok: true, users: (data.users || []).map(normalizeUser)};
  } catch(err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};

/* ملاحظة عربية */
export const getUserById = async (tzOrId, {publicMode = false} = {}) => {
  try {
    const res = publicMode ? await publicApi.get(`/user/public/${tzOrId}`) : await api.get(`/user/${tzOrId}`);
    const {status, data} = res;
    if (![200,201].includes(status) || !data?.ok) throw new Error('لا يوجد مستخدم بالمعرف ' + tzOrId);
    return {ok: true, user: normalizeUser(data.user)};
  } catch (err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
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
    if (![200,201].includes(status) || !data?.ok) throw new Error('لم يتم إنشاء المستخدم');
    return { ok: true, user: extractUser(data) };
  } catch (err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
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
    if (![200,201].includes(status) || !data?.ok) throw new Error('لم يتم تحديث المستخدم');
    return { ok: true, user: extractUser(data.user) };
  } catch (err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
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
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'لم يتم تحميل صورة الطالب');
        return {ok: true, photo: data.photo}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}

export const deletePhoto = async(tz) => {
    try {
        const { data, status } = await api.delete(`/user/photo/${encodeURIComponent(tz)}`);
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'لم يتم حذف الصورة');
        return {ok: true, photo: data.photo};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}

/* ملاحظة عربية */
export const deleteU = async (tz, from, {confirm = true} = {}) => {
  if(confirm) {
            const ok = await ask("delete");
            if(!ok) {
                return null;
            }
        }
  try {
    const {status, data} = await api.delete(`/user/${tz}/${from}`);
    if (![200,201].includes(status) || !data?.ok) throw new Error ('لم يتم حذف المستخدم');
    return { ok: true, user: null };
  } catch (err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};

/* ملاحظة عربية */
export const addSub = async (userId, subId, start, end) => {

  try {
    const {status, data} = await api.post(`/user/addSub/${userId}/${subId}`, {start, end});
    if (![200,201].includes(status) || !data?.ok) throw new Error('لم تتم إضافة اشتراك للمستخدم');
    return { ok: true, user: extractUser(data.data) };
  } catch (err) {
    const msg = err?.response?.data?.message || err.message || "خطأ في إضافة الاشتراك";
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};


/* ملاحظة عربية */
export const removeSub = async (_userId) => {

  try {
    const {status, data} = await api.post(`/user/removeSub/${_userId}`);
    if (![200,201].includes(status) || !data?.ok) throw new Error('لم تتم إزالة اشتراك المستخدم');
    return { ok: true, user: extractUser(data) };
  } catch (err) {
    const msg = err?.response?.data?.message || err.message || "خطأ في إزالة الاشتراك";
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
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
