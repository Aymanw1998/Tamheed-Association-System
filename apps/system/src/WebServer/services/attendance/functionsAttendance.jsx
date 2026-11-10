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
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err?.response?.data?.message || err.message };
    }
};

export const saveAttendanceSheet = async (lessonId, { year, month, day }, items, baseVersion) => {
    try {
        console.log("saveAttendanceSheet", { lessonId, year, month, day, items });
        const { data, status } = await api.post("/attendance/bulk-save", {
        lessonId, year, month, day,
        items,
        baseVersion,
        });
        if (![200, 201].includes(status) || !data.ok) throw Object.assign(new Error(data?.message || "failed"), { status });
        return { ok: true, overwritten: data.overwritten || [] };
    } catch (err) {
        return { ok: false, status: err?.response?.status || err?.status || 0, data: err?.response?.data, message: err?.response?.data?.message || err.message };
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
        return {ok: false, status: err.response?.status, data: err.response?.data, message: err?.response?.data?.message || err.message };
    }
};

// One lesson's marks over a period, for the Excel export (owner, 2026-11-10):
// { ok, lesson: { name }, rows: [{ dateKey, name, kind, status, notes, auto }] }.
export const exportAttendance = async (lessonId, { from, to }) => {
    try {
        const { data } = await api.get("/attendance/export", { params: { lessonId, from, to } });
        if (!data?.ok) throw new Error(data?.message || "failed");
        return { ok: true, lesson: data.lesson, rows: data.rows || [] };
    } catch (err) {
        return { ok: false, status: err?.response?.status || 0, message: err?.response?.data?.message || err.message };
    }
};
