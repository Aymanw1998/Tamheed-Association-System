
//service
import { apiService } from "../api";

export const POST = async(student) => {
    try{
        const res = await apiService.post("/student", student);
        const { schema } = res.data;
        return schema;
    } catch(err) {console.error("Create Student error: ", err.response?.data || err.message); throw err}

}

export const PUT = async(tz, student) => {
    try{
        const res = await apiService.put("/student/"+tz, student);
        const { schema } = res.data;
        return schema;
    } catch(err) {console.error("Create Student error: ", err.response?.data || err.message); throw err}

}

export const DELETE = async(tz) => {
    try{
        const res = await apiService.delete("/student/"+tz);
        const { schema } = res.data;
        return schema;
    } catch(err) {console.error("Create Student error: ", err.response?.data || err.message); throw err}

}

export const GET = async(tz = null) => {
    try{
        if(tz)
        {
            const res = await apiService.get("/student/"+tz)
            console.log("get student", res);
            const { schema } = res.data;
            return schema;
        }
        const res = await apiService.get("/student")
        console.log("get student", res);
        const { schema } = res.data;
        return schema;
    } catch(err) {console.error("Get All Strudent error: ", err.response?.data || err.message); throw err}

}