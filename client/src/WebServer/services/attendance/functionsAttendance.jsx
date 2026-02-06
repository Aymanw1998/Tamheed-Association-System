import api from "../api";

export const getAttendanceSheet = async (lessonId, { year, month, day }) => {
    try {
        console.log("getAttendanceSheet", { lessonId, year, month, day });
        const { data, status } = await api.get("/attendance/sheet", {
        params: { lessonId, year, month, day },
        });
        if (![200, 201].includes(status) || !data.ok) throw new Error(data?.message || "failed");
        return { ok: true, sheet: data.schema };
    } catch (err) {
        return { ok: false, message: err?.response?.data?.message || err.message };
    }
};

export const saveAttendanceSheet = async (lessonId, { year, month, day }, items) => {
    try {
        console.log("saveAttendanceSheet", { lessonId, year, month, day, items });
        const { data, status } = await api.post("/attendance/bulk-save", {
        lessonId, year, month, day,
        items,
        });
        if (![200, 201].includes(status) || !data.ok) throw new Error(data?.message || "failed");
        return { ok: true };
    } catch (err) {
        return { ok: false, message: err?.response?.data?.message || err.message };
    }
};

export const getLessonDates = async (lessonId) => {
    try {
        console.log("getLessonDates", { lessonId });
        const { data, status } = await api.get("/attendance/dates", { params: { lessonId } });
        console.log("getLessonDates response", status, data);
        if (![200, 201].includes(status) || !data.ok) throw new Error(data?.message || "failed");
        return { ok: true, dates: data.schema || [] };
    } catch (err) {
        return { ok: false, message: err?.response?.data?.message || err.message };
    }
};
