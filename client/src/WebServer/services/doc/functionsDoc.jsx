import { ask } from "../../../Components/Provides/confirmBus";
import api,{setAuthToken } from "../api";

export const getTest = async() => {
    try{
        const {data, status} = await api.get('/doc/test');
        if(![200,201].includes(status)) throw new Error ('لا يمكن تحميل الملف');
        return {ok: true, data};
    }
    catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}

export const getDocById = async(id) => {
    try{
        const {data, status} = await api.get(`/doc/${id}/file`);
        if(![200,201].includes(status)) throw new Error ('لا يمكن تحميل الملف');
        return {ok: true, data};
    }   
    catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}