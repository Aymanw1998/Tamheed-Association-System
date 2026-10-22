// AUTH services
import axios from "axios";
import api, { API_BASE_URL, publicApi, refreshSession, setAuthTokens } from "../api";
import { scheduleAccessRefresh, clearAccessRefresh } from "../../utils/accessScheduler";
import { rememberSessionUser } from "../../../utils/session";
import { isForcedChange } from "../../../utils/passwordChange";
import { stopDemo } from "../../../journey/demoMode";

function markSignedIn(user, accessToken, expirationTime) {
  setAuthTokens(accessToken, expirationTime);
  scheduleAccessRefresh(accessToken);
  localStorage.setItem("isLoggedIn", "1");
  rememberSessionUser(user);
}

export async function register(payload) {
  try {
    const { data, status } = await api.post("/auth/register/", payload, { withCredentials: true });
    if (![200, 201].includes(status)) throw new Error(data?.message || "تعذّر التسجيل");
    return { ok: true, message: data.message || "تم التسجيل بنجاح" };
  } catch (err) {
    console.error("Register error:", err?.response?.data || err.message);
    return { ok: false, message: err.response?.data?.message || err.message || "تعذّر إتمام العملية." };
  }
}

// Resolves to the user, or to { mustChangePassword: true, accessToken } when
// the system account's password has expired. That token only works on
// change-password, so it is kept in memory and never stored as the session.
export async function login(tz, password) {
  const { data, status } = await api.post("/auth/login", { tz, password }, { withCredentials: true });
  if (![200, 201].includes(status) || !data?.ok) {
    throw new Error(data?.message || "تعذّر تسجيل الدخول");
  }
  if (isForcedChange(data)) {
    return { mustChangePassword: true, accessToken: data.accessToken };
  }

  const { accessToken, expirationTime, user } = data;
  markSignedIn(user, accessToken, expirationTime);
  return user;
}

export async function refresh() {
  const data = await refreshSession();
  if (!data?.ok || !data?.accessToken) {
    throw new Error("انتهت الجلسة. يُرجى تسجيل الدخول مرة أخرى.");
  }

  setAuthTokens(data.accessToken, data.expirationTime);
  scheduleAccessRefresh(data.accessToken);
  return { accessToken: data.accessToken, expirationTime: data.expirationTime };
}

export async function getMe() {
  try {
    const token = localStorage.getItem("accessToken");
    const res = await api.post(
      "/auth/me",
      {},
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        withCredentials: true,
      }
    );

    const { data, status } = res;

    if (![200, 201].includes(status) || !data?.ok) {
      throw new Error(data?.message || "تعذّر التعرّف على المستخدم.");
    }

    // Keep what the server granted next to the user so the app can hide UI.
    // isSystem is sent only for the system account.
    return data.user
      ? { ...data.user, role: data.role, permissions: data.permissions, isSystem: data.isSystem === true }
      : data.user;
  } catch (err) {
    return null;
  }
}

export async function logout() {
  // Leave training mode first, so the sign-out reaches the server for real.
  stopDemo();
  try {
    await api.post("/auth/logout", {}, { withCredentials: true });
  } catch {}

  clearAccessRefresh();
  setAuthTokens(null);
  localStorage.clear();
  localStorage.setItem("LOGOUT_BROADCAST", String(Date.now()));
  window.location.assign("/");
}

// POST /auth/change-password. `token` is the limited token from login (forced
// change); without it the stored session token is used, and the new session
// the server returns replaces it (older tokens stop working). Throws with the
// server's error code on .code.
export async function changePassword(currentPassword, newPassword, token) {
  const client = token ? publicApi : api;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  let data;
  try {
    ({ data } = await client.post("/auth/change-password", { currentPassword, newPassword }, { headers }));
  } catch (err) {
    const status = err?.response?.status;
    const code = status === 401 ? "EXPIRED" : status === 429 ? "RATE_LIMITED" : err?.response?.data?.code || "generic";
    throw Object.assign(new Error(code), { code });
  }
  if (!data?.ok) throw Object.assign(new Error("generic"), { code: data?.code || "generic" });
  if (!token && data.accessToken) {
    setAuthTokens(data.accessToken, data.expirationTime);
    scheduleAccessRefresh(data.accessToken);
  }
  return { ok: true };
}

export async function forgotPassword(tz) {
  try {
    const { data, status } = await api.post("/auth/forgot-password", { tz }, { withCredentials: true });
    if (![200, 201].includes(status) || !data?.ok) {
      throw new Error(data?.message || "تعذّر طلب إعادة تعيين كلمة المرور");
    }
    return { ok: true, message: data.message || "تم إرسال طلب إعادة تعيين كلمة المرور بنجاح", data };
  } catch (err) {
    console.error("Forgot Password error:", err?.response?.data || err.message);
    return { ok: false, message: err.response?.data?.message || err.message || "تعذّر إتمام العملية." };
  }
}

export async function resetPassword(tz, otp, newPassword, confirmPassword) {
  try {
    const { data, status } = await api.post(
      "/auth/reset-password",
      { tz, otp, newPassword, confirmPassword },
      { withCredentials: true }
    );
    if (![200, 201].includes(status) || !data?.ok) {
      throw new Error(data?.message || "تعذّرت إعادة تعيين كلمة المرور");
    }
    return { ok: true, message: data.message || "تم تعيين كلمة المرور بنجاح" };
  } catch (err) {
    console.error("Reset Password error:", err?.response?.data || err.message);
    return { ok: false, message: err.response?.data?.message || err.message || "تعذّر إتمام العملية." };
  }
}
