import { ask } from "../../../Components/Provides/confirmBus";
import api from "../api";

export const normalizeStudent = (student) => {
    if (!student) return null;
    return {
        ...student,
        firstname: String(student.firstname || ""),
        lastname: String(student.lastname || ""),
        father_name: String(student.father_name || ""),
        roles: Array.isArray(student.roles) ? student.roles.filter(Boolean) : [],
    };
};
// Exact full ID number lookup for adding a student to a lesson roster.
// Resolves {ok:true, student:{tz, firstname, lastname, _id}} or {ok:false, notFound}.
export const lookupStudent = async(tz) => {
    try{
        const {data} = await api.get("/student/lookup/" + encodeURIComponent(String(tz).trim()));
        if(!data?.ok || !data.student) return {ok: false, notFound: true};
        return {ok: true, student: data.student};
    } catch(err){
        return {ok: false, notFound: err.response?.status === 404};
    }
}

export const getAll = async() => {
    try{
        const {status, data} = await api.get("/student/");
        if(![200,201].includes(status) || !data?.ok) throw new Error('لا يوجد طلاب');
        return {ok: true, students: (data.students || []).map(normalizeStudent).filter(Boolean)}
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

/**
 * ملاحظة عربية
 * @param {string} idOrName
 */
export const getOne = async(idOrName) => {
    try{
        console.log("getOne student", idOrName);
        const {status, data} = await api.get("/student/"+idOrName);
        if(![200,201].includes(status) || !data?.ok) throw new Error('لا يوجد طالب بهذا المعرّف: ' + idOrName);
        return {ok: true, student: normalizeStudent(data.student)}
    } catch(err){
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

/**
 * ملاحظة عربية
 * @param {{name: string, info?: string}} payload
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
        const { data, status } = await api.post('/student', body);
        if (![200,201].includes(status) || !data?.ok) throw new Error('تعذّر إنشاء الطالب');
        return {ok: true, student: normalizeStudent(data.student)}
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}


/**
 * ملاحظة عربية
 * @param {string} idOrName
 * @param  patch
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
        const { data, status } = await api.put(`/student/${encodeURIComponent(idOrName)}`, body);
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تعذّر تحديث بيانات الطالب');
        return {ok: true, student: normalizeStudent(data.student)}
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

export const uploadPhoto = async(tz, file) => {
    console.log("uploadPhoto student", tz, file);
    try{
        const formData = new FormData();
        formData.append('file', file);
        const { data, status } = await api.post(`/student/upload-photo/${encodeURIComponent(tz)}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تعذّر رفع صورة الطالب');
        return {ok: true, student: data.student}
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

export const deletePhoto = async(tz) => {
    try {
      console.log("deletePhoto student", tz);
        const { data, status } = await api.delete(`/student/photo/${encodeURIComponent(tz)}`);
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تعذّر حذف الصورة');
        return {ok: true, photo: data.photo};
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}
/**
 * ملاحظة عربية
 * @param {string} idOrName
 */
export const deleteS= async(idOrName,{confirm = true} = {}) => {
    if(confirm) {
        const ok = await ask("delete");
        if(!ok) {
            return null;
        }
    }
    try{
        const { data, status } = await api.delete(`/student/${encodeURIComponent(idOrName)}`);
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تعذّر حذف الطالب');
        return {ok: true, student: null}
    } catch(err) {
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err.response?.data?.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

