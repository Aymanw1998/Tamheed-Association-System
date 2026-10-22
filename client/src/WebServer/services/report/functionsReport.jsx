import { ask } from "../../../Components/Provides/confirmBus";
import api from "../api";

const namespace = "/report";
export const getAll = async() => {
    try{
        const {status, data} = await api.get(namespace);
        console.log("getAll report", status, data);
        if(![200,201].includes(status)) throw new Error('لا توجد تقارير');
        return {ok: true, reports: data.reports || []}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

/**
 * ملاحظة عربية
 * @param {string} idOrName
 */
export const getOne = async(idOrName) => {
    try{
        console.log("getOne student", idOrName);
        const {status, data} = await api.get(`${namespace}/`+idOrName);
        console.log("getOne report", status, data);
        if(![200,201].includes(status)) throw new Error('لا يوجد تقرير بهذا المعرّف: ' + idOrName);
        return {ok: true, report: data.report || null}
    } catch(err){
        return {ok: false, message: err.response.data.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

/**
 * ملاحظة عربية
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
        if (![200,201].includes(status)) throw new Error('تعذّر إنشاء التقرير');
        return {ok: true, report: data.report}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'تعذّر إتمام العملية.'};
    }
}


/**
 * ملاحظة عربية
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
        if (![200,201].includes(status)) throw new Error(data?.message || 'تعذّر تحديث التقرير');
        return {ok: true, report: data.report}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'تعذّر إتمام العملية.'};
    }
}

/**
 * ملاحظة عربية
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
        if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تعذّر حذف التقرير');
        return {ok: true, report: null}
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'تعذّر إتمام العملية.'};
    }
}
