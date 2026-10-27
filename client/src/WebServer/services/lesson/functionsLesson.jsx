import { ask } from "../../../Components/Provides/confirmBus";
import api from "../api";

export const normalizeLesson = (lesson) => {
    if (!lesson) return null;
    return {
        ...lesson,
        name: String(lesson.name || ""),
        list_students: Array.isArray(lesson.list_students) ? lesson.list_students.filter((value) => value != null) : [],
        date: lesson.date || {},
    };
};

export const getAllLesson = async() => {
    try{
        const {data, status} = await api.get('/lesson');
        if(![200,201].includes(status) || !data.ok) throw new Error ('تعذّر تحميل الدروس');
        return {ok: true, lessons: (data.lessons || data.schema || []).map(normalizeLesson).filter(Boolean)};
    } catch(err) {    
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

// Football lessons for the general schedule (read-only, room 9).
export const getSportSchedule = async() => {
    try{
        const {data, status} = await api.get('/lesson/sport-schedule');
        if(![200,201].includes(status) || !data.ok) throw new Error ('تعذّر تحميل دروس الرياضة');
        return {ok: true, lessons: Array.isArray(data.lessons) ? data.lessons : []};
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

export const getOneLesson = async(_id) => {
    try{
        const {data, status} = await api.get('/lesson/' + _id, );
        if(![200,201].includes(status) || !data.ok) throw new Error ('تعذّر تحميل الدرس');
        return {ok: true, lesson: normalizeLesson(data.lesson || data.schema)};
    } catch(err) {    
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

export const getLessonsByQuery = async(params) => {    
    try{
    console.log("in func api getLessonsByQuery params", params);
    const {data, status} = await api.get('/lesson/query', {params});
        if(![200,201].includes(status) || !data.ok) throw new Error ('تعذّر تحميل البيانات');
        console.log("getLessonsByQuery", data, status);
        return {ok: true, lessons: (data.lessons || data.schema || []).map(normalizeLesson).filter(Boolean)};
    } catch(err) {    
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
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
        if(![200,201].includes(res.status) || !res.data.ok) throw new Error (data?.message || 'تعذّر إنشاء الدرس');
        return {ok: true, lesson: normalizeLesson(res.data.lesson || res.data.schema)};
    } catch(err) {
        console.error(err);
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || 'تعذّر إتمام العملية.'};
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
        if(![200,201].includes(status) || !data.ok) throw new Error (data?.message || 'تعذّر تحديث الدرس');
        return {ok: true, lesson: normalizeLesson(data.lesson || data.schema)};
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
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
        if(![200,201].includes(status) || !data.ok) throw new Error (data?.message || 'تعذّر حذف الدرس');
        return {ok: true, lesson: null};
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

// ملاحظة عربية
// Adds students to a lesson: `list_students` are _ids the viewer can see,
// `list_tz` are full ID numbers (the only way a guide adds someone hidden).
// The server answers ok even when it dropped an entry, so callers re-read the lesson.
export async function addToList(lessonId, { list_students = [], list_tz = [] } = {}) {
    try{
        const { data, status } = await api.post(`/lesson/addToList/${encodeURIComponent(lessonId)}`, {
            list_students,
            list_tz,
        });
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تعذّرت إضافة الطلاب إلى الدرس');
        // updatedAt: the lesson's new version, the base of the next form save.
        return {ok: true, updatedAt: data.updatedAt};
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

export async function removeFromList(lessonId, traineeIds = []) {
    try{
        const { data, status } = await api.post('/lesson/removeFromList', {
            id: lessonId,
            list_trainees: traineeIds,
        });
        if (![200,201].includes(status)) throw new Error(data?.message || 'تعذّرت إزالة الطالب من الدرس');
        return {ok: true, lessons: data.lessons || data.schema};
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
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

export const getLessonsToday = async () => {
    try {
        const { data, status } = await api.get("/lesson/today");
        if (![200, 201].includes(status) || !data.ok) throw new Error(data?.message || "failed");
        return { ok: true, lessons: (data.lessons || []).map(normalizeLesson).filter(Boolean) };
    } catch (err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err?.response?.data?.message || err.message };
    }
};
