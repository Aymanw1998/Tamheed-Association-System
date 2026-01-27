// 📁 src/WebServer/services/user/functionsUser.js
import { fromJSON } from "postcss";
import { ask } from "../../../Components/Provides/confirmBus";
import api, { publicApi } from "../api";

// עוזר קטן לאחידות תשובות user מהשרת
const extractUser = (data) => data?.user ?? data ?? null;
/**
 * 
 * @param {*} tz |  מזהה משתמש (תעודת זהות) 
 * @param {*} from | חדר נוכחי (Active, noActive, Waiting)
 * @param {*} to  | חדר יעד (Active, noActive, Waiting)
 * 
 * @returns 
 */
export const changeStatus = async (tz, from, to) => {
  try {
    const {status, data} = await api.post(`/user/changeStatus/${tz}`, {from, to});
    if (![200,201].includes(status) || !data?.ok) throw new Error('משתמש לא שונה סטטוס');
    return { ok: true, message: data.message};
  }catch(err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  } 
}
/** כל המשתמשים */
export const getAll = async (rooms = null) => {
  try{
    const {status, data} = await api.get('/user/', rooms ? {rooms} : {});
    if (![200,201].includes(status) || !data?.ok) throw new Error('לא קיים משתמשים');
    return {ok: true, users: data.users};
  } catch(err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};

/** משתמש לפי מזהה (tz או _id לפי ה־route שלך) */
export const getUserById = async (tzOrId, {publicMode = false} = {}) => {
  try {
    const res = publicMode ? await publicApi.get(`/user/public/${tzOrId}`) : await api.get(`/user/${tzOrId}`);
    const {status, data} = res;
    if (![200,201].includes(status) || !data?.ok) throw new Error('לא קיים משתמש בעל מזהה' + tzOrId);
    console.log("getUserById", data);
    return {ok: true, user: data.user};
  } catch (err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};

/** יצירת משתמש */
export const create = async (payload, {confirm = true} = {}) => {
  if(confirm) {
            const ok = await ask("create");
            if(!ok) {
                return null;
            }
        }
  try {
    console.log("create user payload", payload);
    const {status, data} = await api.post("/user/", payload);
    if (![200,201].includes(status) || !data?.ok) throw new Error('לא נוצר משתמש');
    return { ok: true, user: extractUser(data) };
  } catch (err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};

/** עדכון מלא (PUT) – שומר על החתימה הקיימת בקוד שלך */
export const update = async (tz, petch, {confirm = true} = {}) => {
  if(confirm) {
            const ok = await ask("change");
            if(!ok) {
                return null;
            }
        }
  try {
    const {status, data} = await api.put(`/user/${tz}`, petch);
    if (![200,201].includes(status) || !data?.ok) throw new Error('משתמש לא עודכן');
    return { ok: true, user: extractUser(data.user) };
  } catch (err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};

export const uploadPhoto = async(tz, file) => {
    console.log("uploadPhoto student", tz, file);
    try{
        const formData = new FormData();
        formData.append('file', file);
        const { data, status } = await api.post(`/user/upload-photo/${encodeURIComponent(tz)}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'لم يتم تحميل صورة الطالب');
        return {ok: true, student: data.student}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}

/** מחיקת משתמש */
export const deleteU = async (tz, from, {confirm = true} = {}) => {
  console.log("deleteUser", tz, from);
  if(confirm) {
            const ok = await ask("delete");
            if(!ok) {
                return null;
            }
        }
  try {
    const {status, data} = await api.delete(`/user/${tz}/${from}`);
    if (![200,201].includes(status) || !data?.ok) throw new Error ('משתמש לא נמחק');
    return { ok: true, user: null };
  } catch (err) {
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};

/** הוספת מנוי למשתמש המחובר (על פי ה־middleware שלך) */
export const addSub = async (userId, subId, start, end) => {

  try {
    const {status, data} = await api.post(`/user/addSub/${userId}/${subId}`, {start, end});
    if (![200,201].includes(status) || !data?.ok) throw new Error('משתמש לא נוסף לו מנוי');
    return { ok: true, user: extractUser(data.data) };
  } catch (err) {
    const msg = err?.response?.data?.message || err.message || "שגיאה בהוספת מנוי";
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};


/** הסרת מנוי ממשתמש לפי _id */
export const removeSub = async (_userId) => {

  try {
    const {status, data} = await api.post(`/user/removeSub/${_userId}`);
    if (![200,201].includes(status) || !data?.ok) throw new Error('משתמש לא נמחק לו המנוי');
    console.log("removeSub", status, data);
    return { ok: true, user: extractUser(data) };
  } catch (err) {
    const msg = err?.response?.data?.message || err.message || "שגיאה בהסרת מנוי";
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
};
