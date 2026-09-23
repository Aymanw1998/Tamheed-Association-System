import api, { publicApi } from "../api";

const errorMessage = (err, fallback) => err?.response?.data?.message || fallback;

// Admin only: the fixed parent-registration link and its intake stats.
export const getLink = async () => {
    try {
        const { data } = await api.get("/inviteToken/link");
        return {
            ok: true,
            token: data.token,
            usedThisWeek: data.usedThisWeek,
            weeklyLimit: data.weeklyLimit,
            attempts: data.attempts || [],
        };
    } catch (err) {
        return { ok: false, message: errorMessage(err, "تعذّر تحميل رابط التسجيل") };
    }
};

export const rotateLink = async () => {
    try {
        const { data } = await api.post("/inviteToken/link/rotate");
        return { ok: true, token: data.token };
    } catch (err) {
        return { ok: false, message: errorMessage(err, "تعذّر تغيير الرابط") };
    }
};

// Public: the parents' page must never send or refresh a login, so these use
// publicApi instead of api.
export const validate = async (token) => {
    try {
        const { data } = await publicApi.get(`/inviteToken/validate/${encodeURIComponent(token)}`);
        return { valid: Boolean(data?.valid), open: Boolean(data?.open) };
    } catch (err) {
        return { valid: false, open: false };
    }
};

export const submit = async (token, fields, photo) => {
    try {
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => {
            if (value !== null && value !== undefined) formData.append(key, value);
        });
        if (photo instanceof File) formData.append("photo", photo);

        const { data } = await publicApi.post(`/inviteToken/submit/${encodeURIComponent(token)}`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 120000, // a 5MB photo on a slow phone connection
        });
        return { ok: true, message: data?.message };
    } catch (err) {
        return {
            ok: false,
            code: err?.response?.data?.code || "",
            message: errorMessage(err, "تعذّر إرسال الطلب، حاولوا لاحقًا"),
        };
    }
};
