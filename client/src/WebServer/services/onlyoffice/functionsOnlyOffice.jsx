import { ask } from "../../../Components/Provides/confirmBus";
import api,{setAuthToken } from "../api";

export const getConfigOnlyOffice = async(id) => {
    try{
        const {data, status} = await api.get(`/onlyoffice/${id}/config`);  
        console.log("OnlyOffice config response:", data, status);
        if(![200,201].includes(status)) throw new Error ('לא ניתן לקבל את הגדרות העורך');
        return {ok: true, data: data || {}};
    } catch(err) {
        return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
    }
}