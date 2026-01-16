import { ask } from "../../../Components/Provides/confirmBus";
import api,{ setAuthToken } from "../api";

const namespace = "/report";
export const getAll = async() => {
    try{
        const {status, data} = await api.get(namespace);
        console.log("getAll report", status, data);
        if(![200,201].includes(status)) throw new Error('لا يوجد تقارير');
        return {ok: true, reports: data || []}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}

/**
 * שליפת אימון בודד לפי ObjectId או שם
 * @param {string} idOrName
 */
export const getOne = async(idOrName) => {
    try{
        console.log("getOne student", idOrName);
        const {status, data} = await api.get(`${namespace}/`+idOrName);
        console.log("getOne report", status, data);
        if(![200,201].includes(status)) throw new Error('لا يوجد تقرير موجود صاحب رقم التعريف هذا: ' + idOrName);
        return {ok: true, report: data}
    } catch(err){
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}

/**
 * יצירת אימון חדש
 * @param {{date: Date, attendance: [], title: [], info: String, createdBy: _id}} payload
 */

export const create = async(payload, {confirm = true} = {}) => {
    console.log("create student", payload, confirm);
    if(confirm) {
        const ok = await ask("create");
        if(!ok) {
            return null;
        }
    }
    try{
        const body = {...payload};
        const { data, status } = await api.post(namespace, body);
        if (![200,201].includes(status)) throw new Error('الطالب لم يتم إنشاؤه');
        return {ok: true, report: data}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}


/**
 * עדכון אימון קיים (לפי Id או שם)
 * @param {string} idOrName
 * @param {{date: Date, attendance: [], title: [], info: String, createdBy: _id}} patch
 */
export const update= async(idOrName, patch,{confirm = true} = {}) => {
    console.log("update student", idOrName, patch, confirm);
    if(confirm) {
        const ok = await ask("change");
        if(!ok) {
            return null;
        }
    }
    try{
        const body = {...patch};
        const { data, status } = await api.put(`${namespace}/${encodeURIComponent(idOrName)}`, body);
        if (![200,201].includes(status)) throw new Error(data?.message || 'الطالب لم يتم تحديثه');
        return {ok: true, report: data}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}

/**
 * מחיקה (לפי Id או שם)
 * @param {string} idOrName
 */
export const deleteR= async(idOrName,{confirm = true} = {}) => {
    if(confirm) {
        const ok = await ask("delete");
        if(!ok) {
            return null;
        }
    }
    try{
        const { data, status } = await api.delete(`${namespace}/${encodeURIComponent(idOrName)}`);
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'الطالب لم يتم حذفه');
        return {ok: true, report: null}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}

export const generateStudentPDF = async(tz) => {
    const encodedTz = encodeURIComponent(tz);
    const urlBase = api.defaults.baseURL || '';
    console.log("generateStudentPDF", urlBase, encodedTz);
    // /api כי בשרת השתמשנו ב־ app.use('/api/student', ...)
    const url = `${urlBase}/student/generate-pdf/${encodedTz}`;

    window.open(url, '_blank', 'noopener,noreferrer');

    return;
    console.log("generateStudentPDF student", tz);
    try{
        const { data, status } = await api.get(`/student/generate-pdf/${encodeURIComponent(tz)}`, {
            responseType: 'blob', // חשוב לקבל את התגובה כ־blob
        });
        if (![200,201].includes(status)) throw new Error('لم يتم إنشاء ملف PDF للطالب');
            // יצירת קובץ מה־blob והורדה למחשב
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${tz}.pdf`; // שם הקובץ שיורד (אותו safeFileName מהשרת אם תרצי)
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        return {ok: true}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'يوجد خلل في العملية'};
    }
}