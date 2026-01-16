import { ask } from "../../../Components/Provides/confirmBus";
import api,{setAuthToken } from "../api";

export const getAllLesson = async() => {
    try{
        const {data, status} = await api.get('/lesson');
        if(![200,201].includes(status) || !data.ok) throw new Error ('לא קיים שיעורים במערכת');
        return {ok: true, lessons: data.lessons || data.schema || []};
    } catch(err) {    
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export const getOneLesson = async(_id) => {
    try{
        const {data, status} = await api.get('/lesson/' + _id, );
        if(![200,201].includes(status) || !data.ok) throw new Error ('השיעור לא קיים');
        return {ok: true, lesson: data.lesson || data.schema};
    } catch(err) {    
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export const getLessonsByQuery = async(params) => {    
    try{
    console.log("in func api getLessonsByQuery params", params);
    const {data, status} = await api.get('/lesson/query', {params});
        if(![200,201].includes(status) || !data.ok) throw new Error ('يوجد خطأ في جلب البيانات');
        console.log("getLessonsByQuery", data, status);
        return {ok: true, lessons: data.lessons || data.schema};
    } catch(err) {    
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}
export const createLesson = async(payload, {confirm = true} = {}) => {
    try{
        if(confirm) {
            const ok = await ask("create");
            if(!ok) {
                    return null;
            }
        }
        console.log("create lesson", payload);
        const res = await api.post('/lesson', payload);
        console.log(res);
        if(![200,201].includes(res.status) || !res.data.ok) throw new Error (data?.message || 'השיעור לא נוצר');
        return {ok: true, lesson: res.data.lesson || res.data.schema};
    } catch(err) {
        console.error(err);
        return {ok: false, message: err.response.data.message || 'حدث خطأ أثناء العملية.'};
    }
}
export const updateLesson = async(_id, payload, {confirm = true} = {}) => {
    try{
        if(confirm) {
            const ok = await ask('change');
            if(!ok) {
                    return null;
            }
        }
        const {data, status} = await api.put(`/lesson/${encodeURIComponent(_id)}`, payload);
        console.log("update lesson", status, data);
        if(![200,201].includes(status) || !data.ok) throw new Error (data?.message || 'השיעור לא עודכן');
        return {ok: true, lesson: data.lesson || data.schema};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export const deleteLesson = async(_id, {confirm = true} = {}) => {
    try{
        if(confirm) {
            const ok = await ask("delete");
            if(!ok) {
                    return null;
            }
        }
        const {data, status} = await api.delete(`/lesson/${encodeURIComponent(_id)}`);
        console.log("delete lesson", status, data);
        if(![200,201].includes(status) || !data.ok) throw new Error (data?.message || 'השיעור לא נמחק');
        return {ok: true, lesson: null};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

// ניהול רשימות משתתפים (כפי שהיה)
export async function addToList(lessonId, traineeIds = []) {
    try{
        const { data, status } = await api.post(`/lesson/addToList/${encodeURIComponent(lessonId)}`, {
        list_trainees: traineeIds,
        });
        if (![200,201].includes(status)) throw new Error(data?.message || 'הוסף מתאמן לשיעור נכשלה');
        return {ok: true, lessons: data.lessons || data.schema};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export async function removeFromList(lessonId, traineeIds = []) {
    try{
        const { data, status } = await api.post('/lesson/removeFromList', {
            id: lessonId,
            list_trainees: traineeIds,
        });
        if (![200,201].includes(status)) throw new Error(data?.message || 'הסרת מתאמן משיעור נכשלה');
        return {ok: true, lessons: data.lessons || data.schema};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export async function copyLessonsMonth(params = {}) {
    try {
        const res = await api.post(`/lesson/copy-month`);
        console.log("copyLessonsMonth", res);
        const {data} = await res;
        return { status: res.status, ok: true, ...data };
    } catch (err) {
        return { status: err.status, ok:false, message: err.message || 'bad response' };
    }
}
export async function deleteLessonsPerMonth(month, year) {
    try {
        const res = await api.delete(`/lesson/delete-perMonth/${month}/${year}`);
        console.log("deleteLessonsPerMonth", res);
        const {data} = await res;
        return { status: res.status, ok: true, ...data };
    } catch (err) {
        return { status: err.status, ok:false, message: err.message || 'bad response' };
    }
}
