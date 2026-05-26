import api from "../api";

const normalizeAiResponse = (payload = {}) => {
  const answer =
    payload.answer ||
    payload.message ||
    payload.reply ||
    payload.response ||
    payload.result ||
    payload.data?.answer ||
    payload.data?.message ||
    "";

  return {
    ok: payload.ok !== false && payload.success !== false,
    answer: String(answer || ""),
    raw: payload,
  };
};

export const chatWithAI = async (message, context = {}) => {
  try {
    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) {
      return { ok: false, message: "يرجى كتابة رسالة قبل الإرسال" };
    }

    console.log("[Tamheed Client] Sending AI request", {
      message: cleanMessage,
      context,
    });

    const { data, status } = await api.post("/ai/chat", {
      message: cleanMessage,
      context,
    });
    console.log("[Tamheed Client] Received AI response", {
      status,
      data,
    });
    if (![200, 201].includes(status)) {
      throw new Error(data?.message || "تعذر الاتصال بالمساعد");
    }

    const normalized = normalizeAiResponse(data);
    if (!normalized.ok) {
      throw new Error(data?.message || "تعذر الحصول على رد من المساعد");
    }

    return normalized;
  } catch (err) {
    console.error("[Tamheed Client] AI request failed", {
      message,
      context,
      error: err?.response?.data || err?.message || err,
    });
    return {
      ok: false,
      message: err?.response?.data?.message || err?.response?.data?.error || err.message || "حدث خطأ أثناء الاتصال بالمساعد",
    };
  }
};
