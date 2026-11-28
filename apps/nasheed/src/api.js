// Every call goes to /api/nasheed and carries the nasheed cookie (path
// /api/nasheed). Answers { status, ok, data } and never throws.
const BASE = "/api/nasheed";

export const GENERIC_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
export const TOO_MANY = "محاولات كثيرة. حاول مرة أخرى بعد قليل.";
export const NETWORK_ERROR = "لا يوجد اتصال بالخادم. تحقّق من الإنترنت وحاول مرة أخرى.";

let onSignedOut = () => {};
// The session tells the api what to do when a call finds the session gone.
export const setSignedOutHandler = (fn) => { onSignedOut = typeof fn === "function" ? fn : () => {}; };

async function call(path, { method = "GET", body } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401 && data?.code === "NASHEED_SIGNED_OUT" && path !== "/me") onSignedOut();
    return { status: res.status, ok: res.ok && data?.ok !== false, data: data || {} };
  } catch {
    return { status: 0, ok: false, data: { ok: false, code: "NETWORK" } };
  }
}

// The Arabic text to show for a failed call.
export const errorText = (res, byCode = {}) => {
  if (res?.status === 429) return TOO_MANY;
  if (res?.status === 0) return NETWORK_ERROR;
  const code = res?.data?.code;
  if (code && byCode[code]) return byCode[code];
  return typeof res?.data?.message === "string" && res.data.message ? res.data.message : GENERIC_ERROR;
};

const enc = encodeURIComponent;
const send = (method, path, body) => call(path, { method, body: body ?? {} });

// Anyone: the library, title and lines only.
export const listPublic = () => call("/public");
export const getPublic = (id) => call(`/public/${enc(id)}`);

// Sign-in with the Tamheed ID number and password.
export const login = (tz, password) => send("POST", "/login", { tz, password });
export const logout = () => send("POST", "/logout");
export const getMe = () => call("/me");

// nasheeds.manage
export const createNasheed = (body) => send("POST", "/", body);
export const updateNasheed = (id, body) => send("PUT", `/${enc(id)}`, body);
export const deleteNasheed = (id) => call(`/${enc(id)}`, { method: "DELETE" });
export const restoreNasheed = (trashId) => send("POST", `/restore/${enc(trashId)}`);
