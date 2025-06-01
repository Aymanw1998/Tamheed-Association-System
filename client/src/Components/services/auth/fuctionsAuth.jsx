import { apiService, setAuthToken } from "../api";
export const login = async(username, password) => {
    try{
        console.log("go to server login");
        console.log()
        const res = await apiService.post("/auth/login", {username, password});
        console.log("back from server login");
        const { accessToken, expirationTime, user, message } = res.data;
        // שמירה ב-client: localStorage והגדרת Authorization Header
        if(res.status == 200) {
            setAuthToken(accessToken, expirationTime);
            return {status: res.status, accessToken, expirationTime, user}
        } else return {status:res.status,message}

    } catch(err) {console.error("Login error: ", err.response?.data || err.message); throw err}
}