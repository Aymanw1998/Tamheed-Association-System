import { GENERIC_ERROR, TOO_MANY } from "./strings";

// Every IT call carries the IT cookie (path /api/it) and goes to /api/it.
const BASE = "/api/it";

let onSignedOut = () => {};
// App registers what to do when any call finds the IT session gone.
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
    if (res.status === 401 && data?.code === "IT_SIGNED_OUT") onSignedOut();
    return { status: res.status, ok: res.ok && data?.ok !== false, data: data || {} };
  } catch {
    return { status: 0, ok: false, data: { ok: false, code: "NETWORK" } };
  }
}

// The Arabic text to show for a failed call: a text for the server's code
// when the screen has one, else the server's own message, else a fixed one.
export const errorText = (res, byCode = {}) => {
  if (res?.status === 429) return TOO_MANY;
  const code = res?.data?.code;
  if (code && byCode[code]) return byCode[code];
  return typeof res?.data?.message === "string" && res.data.message ? res.data.message : GENERIC_ERROR;
};

const enc = encodeURIComponent;
const send = (method, path, body) => call(path, { method, body: body ?? {} });

// Sign-in
export const login = (tz, password) => send("POST", "/login", { tz, password });
export const loginPass = (pass) => send("POST", "/login-pass", { pass });
export const verify = (tz, code) => send("POST", "/verify", { tz, code });
export const logout = () => send("POST", "/logout");
export const getMe = () => call("/me");
export const systemPass = () => send("POST", "/system-pass");

// Users
export const getUsers = (room) => call(room ? `/users?room=${enc(room)}` : "/users");
export const getUser = (tz) => call(`/users/${enc(tz)}`);
export const setRole = (tz, role) => send("PUT", `/users/${enc(tz)}/role`, { role });
export const getPermissions = (tz) => call(`/users/${enc(tz)}/permissions`);
export const savePermissions = (tz, { grants, revokes }) => send("PUT", `/users/${enc(tz)}/permissions`, { grants, revokes });
export const getPassword = (tz) => call(`/users/${enc(tz)}/password`);
export const resetPassword = (tz, password) => send("PUT", `/users/${enc(tz)}/password`, { password });
export const unlockUser = (tz) => send("POST", `/users/${enc(tz)}/unlock`);
export const getSessions = (tz) => call(`/users/${enc(tz)}/sessions`);
export const endSession = (tz, sid) => send("DELETE", `/users/${enc(tz)}/sessions/${enc(sid)}`);

// IT users (the system account only)
export const getMembers = () => call("/members");
export const addMember = (tz) => send("POST", `/members/${enc(tz)}`);
export const removeMember = (tz) => send("DELETE", `/members/${enc(tz)}`);
export const blockMember = (tz) => send("POST", `/members/${enc(tz)}/block`);
export const unblockMember = (tz) => send("POST", `/members/${enc(tz)}/unblock`);

// Audit, storage, settings
export const getAudit = (filters = {}, page = 1) => {
  const query = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  return call(`/audit?${query}`);
};
export const getDriveStatus = () => call("/storage/google/status");
export const getDriveConnectUrl = () => send("POST", "/storage/google/connect-url");
export const forceReleaseLock = (key) => send("POST", "/locks/force-release", { key });
export const getPushSettings = () => call("/push/settings");
export const setPushEnabled = (enabled) => send("PUT", "/push/settings", { enabled });
export const recoverSystem = () => send("POST", "/system/recover");
