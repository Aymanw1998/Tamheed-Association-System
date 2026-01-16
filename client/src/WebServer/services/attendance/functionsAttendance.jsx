import { ask } from "../../../Components/Provides/confirmBus";
import api,{setAuthToken } from "../api";

export const getAll = async(params) => {
    try{
        const {data, status} = await api.get('/attendance',{params});
        if(![200,201].includes(status) || !data.ok) throw new Error ('لا توجد سجل حضور في النظام');
        return {ok: true, attendances: data.attendances || data.schema || []};
    } catch(err) {    
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export const getOne = async(_id) => {
    try{
        const {data, status} = await api.get('/attendance/' + _id);
        if(![200,201].includes(status) || !data.ok) throw new Error ('لا يوجد سجل حضور بهذا المعرف');
        return {ok: true, attendance: data.attendance || data.schema};
    } catch(err) {    
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export const getAllByLessonDayMonthYear = async(lessonId, day, month, year) => {
    try{
        const {data, status} = await api.get(`/attendance/${lessonId}/${day}/${month}/${year}`);
        if(![200,201].includes(status) || !data.ok) throw new Error ('لا توجد سجل حضور في هذا التاريخ لهذا الدرس');
        return {ok: true, attendances: data.attendances || data.schema || []};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

/**
 * 
 * @param {*} lessonId 
 * @param {*} day 
 * @param {*} month 
 * @param {*} year 
 * @param {*} payload [{student: studentId, status: boolean}, ...];
 * @param {*} param5 
 * @returns 
 */
export const createAttendanceByList = async(lessonId, day, month, year, payload, {confirm = true} = {}) => {
    try{
        if(confirm) {
            const ok = await ask("create");
            if(!ok) {
                    return null;
            }
        }
        console.log("create attendance", payload);
        const res = await api.post(`/attendance/ByList/${lessonId}/${day}/${month}/${year}`, payload);
        console.log(res);
        if(![200,201].includes(res.status) || !res.data.ok) throw new Error (data?.message || 'הנוכחות לא נוצרה');
        return {ok: true, attendance: res.data.attendances || res.data.schema};
    } catch(err) {
        console.error(err);
        return {ok: false, message: err.response.data.message || 'حدث خطأ أثناء العملية.'};
    }
}
export const updateAtt = async(_id, payload, {confirm = true} = {}) => {
    try{
        if(confirm) {
            const ok = await ask('change');
            if(!ok) {
                    return null;
            }
        }
        const {data, status} = await api.put(`/attendance/${encodeURIComponent(_id)}`, payload);
        console.log("update attendance", status, data);
        if(![200,201].includes(status) || !data.ok) throw new Error (data?.message || 'השיעור לא עודכן');
        return {ok: true, attendance: data.attendances || data.schema};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export const deleteAtt = async(_id, {confirm = true} = {}) => {
    try{
        if(confirm) {
            const ok = await ask("delete");
            if(!ok) {
                    return null;
            }
        }
        const {data, status} = await api.delete(`/attendance/${encodeURIComponent(_id)}`);
        console.log("delete attendance", status, data);
        if(![200,201].includes(status) || !data.ok) throw new Error (data?.message || 'השיעור לא נמחק');
        return {ok: true, attendance: null};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export const getAttendanceHistory = async (params) => {
    // params: { studentId, lessonId, from, to }
    return api.get("/attendance/history", { params }).then(r => r.data).catch(()=> null);
};
