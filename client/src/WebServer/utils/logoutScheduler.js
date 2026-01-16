// src/WebServer/utils/logoutScheduler.js
const KEY = 'LOGOUT_DEADLINE_MS';
const MAX_DAYS = 7;
let logoutTimer = null;

export function setLogoutDeadline(days) {
  // days: 1..7; 0/undefined -> ביטול
  if (!days || days <= 0) {
    localStorage.removeItem(KEY);
    cancelAutoLogout();
    return null;
  }
  const clamped = Math.min(Math.max(days, 1), MAX_DAYS);
  const ms = Date.now() + clamped * 24 * 60 * 60 * 1000;
  localStorage.setItem(KEY, String(ms));
  scheduleAutoLogout(ms);
  return ms;
}

export function clearLogoutDeadline() {
  localStorage.removeItem(KEY);
  cancelAutoLogout();
}

export function getLogoutDeadline() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const ms = Number(raw);
  if (!Number.isFinite(ms)) {
    localStorage.removeItem(KEY);
    return null;
  }
  if (ms <= Date.now()) {
    // עבר הזמן – התנתק מייד
    doLogoutNow();
    return null;
  }
  return ms;
}

export function scheduleAutoLogout(deadlineMs) {
  cancelAutoLogout();
  const delay = Math.max(deadlineMs - Date.now(), 0);
  logoutTimer = setTimeout(doLogoutNow, delay);
}

export function cancelAutoLogout() {
  if (logoutTimer) {
    clearTimeout(logoutTimer);
    logoutTimer = null;
  }
}

function doLogoutNow() {
  try {
    localStorage.clear();
    sessionStorage.clear();
    // סנכרון בין טאבים:
    localStorage.setItem('LOGOUT_BROADCAST', String(Date.now()));
  } catch {}
  // נווט למסך הכניסה
  window.location.assign('/');
}
