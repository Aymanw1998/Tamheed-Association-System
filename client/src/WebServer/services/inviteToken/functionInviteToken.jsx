import api,{ setAuthToken } from "../api";

export const validate = async(token) => {
    try{
        const {data, status} = await api.get(`/inviteToken/validate/${token}`);
        console.log("validate invite token response", data, status);
        if(![200,201].includes(status) || !data?.valid) throw new Error(data.reason);
        return {valid: data.valid};
    }
    catch(err) {
        return {valid: false, reason: err.message};
    }
}

export const createLink = async() => {
    try{
        const {data, status} = await api.post('/inviteToken/create-link');
        if(![200,201].includes(status) || !data?.url) throw new Error(data.message);
        return {url: data.url};
    }
    catch(err) {
        return {url: null, message: err.message};
    }
}

export const submit = async(token, payload) => {
    try{
        const {data, status} = await  api.post(`/inviteToken/submit/${token}`, payload);
        console.log("submit from parent response", data, status);
        if(![200,201].includes(status)) throw new Error(data.message);
        return {ok: true, message: data.message};
    } catch(err) {
        return {ok: false, message: err.message};
    }
}