import api, { publicApi } from "../api";

const errorMessage = (err, fallback) => err?.response?.data?.message || fallback;

// Admin only: the fixed parent-registration link and its intake stats.
export const getLink = async () => {
    try {
        const { data } = await api.get("/inviteToken/link");
        return {
            ok: true,
            token: data.token,
            usedThisMonth: data.usedThisMonth,
            monthlyLimit: data.monthlyLimit,
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

export const getRules = async () => {
    try {
        const { data } = await api.get("/inviteToken/rules");
        return { ok: true, rules: data.rules };
    } catch (err) {
        return { ok: false, message: errorMessage(err, "تعذّر تحميل نظام الجمعية") };
    }
};

export const publishRules = async (text) => {
    try {
        const { data } = await api.post("/inviteToken/rules", { text });
        return { ok: true, rules: data.rules };
    } catch (err) {
        return { ok: false, message: errorMessage(err, "تعذّر نشر نظام الجمعية") };
    }
};

export const getConsent = async (studentId) => {
    try {
        const { data } = await api.get(`/inviteToken/consent/${encodeURIComponent(studentId)}`);
        return { ok: true, consent: data.consent };
    } catch (err) {
        return { ok: false, message: errorMessage(err, "تعذّر تحميل التوقيع") };
    }
};

// Public: the parents' page must never send or refresh a login, so these use
// publicApi instead of api.
export const validate = async (token) => {
    try {
        const { data } = await publicApi.get(`/inviteToken/validate/${encodeURIComponent(token)}`);
        return { valid: Boolean(data?.valid), open: Boolean(data?.open), rules: data?.rules || null };
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
            message: errorMessage(err, "تعذّر إرسال الطلب. يُرجى المحاولة لاحقًا."),
        };
    }
};
