// src/WebServer/services/api.js
import axios from 'axios';
import { markSessionExpired } from '../utils/sessionMessages'; // ملاحظة عربية
import { singleFlight } from '../utils/singleFlight';

// The API is always reached on the same origin as the page: in development the
// CRA dev server proxies /api to the local server (see "proxy" in package.json),
// and in production the server (or a reverse proxy) serves the app and /api from
// one host, so no server URL is configured and no CORS is involved.
export const API_BASE_URL = '/api';

// Every refresh in the app goes through here, so overlapping callers share one
// request instead of racing the server's rotating refresh cookie.
export const refreshSession = singleFlight(() =>
  axios
    .post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true, timeout: 15000 })
    .then((res) => res.data)
);

// ملاحظة عربية
let accessToken = localStorage.getItem('accessToken') || null;

// ملاحظة عربية
export function setAuthTokens(at, expirationTime /* انتهاء الصلاحية */) {
  accessToken = at || null;
  if (at) {
    localStorage.setItem('accessToken', at);
  } else {
    console.warn("Clearing access token");
    localStorage.removeItem('accessToken');
  }

  // ملاحظة عربية
  if (expirationTime) {
    localStorage.setItem('accessTokenExp', String(expirationTime));
  } else {
    localStorage.removeItem('accessTokenExp');
  }
}

// ملاحظة عربية
export function getAuthToken() {
  return accessToken;
}

export const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
  timeout: 15000,
});
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false, // ملاحظة عربية
  timeout: 15000,
});

// ملاحظة عربية
function hardResetToLogin(reason = 'انتهت الجلسة. يُرجى تسجيل الدخول مرة أخرى.') {
  try {
    // ملاحظة عربية
    try {
      markSessionExpired(reason);
    } catch {
      localStorage.setItem('SESSION_EXPIRED_REASON', reason);
    }

    localStorage.setItem('LOGOUT_BROADCAST', JSON.stringify({ ts: Date.now(), reason }));
    localStorage.removeItem('accessToken');
    localStorage.removeItem('accessTokenExp');
    sessionStorage.clear();
  } catch (_) {}
  window.location.assign('/'); // ملاحظة عربية
}

// ملاحظة عربية
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return config;
});

// ملاحظة عربية
let isRefreshing = false;
let refreshWaitQueue = []; // ملاحظة عربية

function enqueueWaiter(original) {
  return new Promise((resolve, reject) => {
    refreshWaitQueue.push({
      resolve: () => resolve(api.request(original)),
      reject,
    });
  });
}

function flushQueue(err) {
  const queue = [...refreshWaitQueue];
  refreshWaitQueue = [];
  queue.forEach((p) => (err ? p.reject(err) : p.resolve()));
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error?.config || {};
    const status = error?.response?.status;
    const code = error?.response?.data?.code || '';

    // ملاحظة عربية
    const isRefreshRequest = typeof original.url === 'string' && original.url.includes('/auth/refresh');
    if (isRefreshRequest) {
      return Promise.reject(error);
    }

    // ملاحظة عربية
    if (status === 401 && code === 'TOKEN_EXPIRED' && !original.__isRetry) {
      original.__isRetry = true;

      if (isRefreshing) {
        // ملاحظة عربية
        return enqueueWaiter(original);
      }

      isRefreshing = true;
      try {
        // ملاحظة عربية
        const data = await refreshSession();

        if (!data?.accessToken) {
          throw new Error('No accessToken from refresh');
        }

        // ملاحظة عربية
        setAuthTokens(data.accessToken, data.expirationTime);

        // ملاحظة عربية
        try {
          window.dispatchEvent(
            new CustomEvent('ACCESS_TOKEN_REFRESHED', { detail: { accessToken: data.accessToken } })
          );
        } catch {}

        // ملاحظة عربية
        flushQueue(null);
        return api.request(original);
      } catch (e) {
        flushQueue(e);
        hardResetToLogin('انتهت الجلسة. يُرجى تسجيل الدخول مرة أخرى.');
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    // ملاحظة عربية
    if (
      status === 401 &&
      ['NO_TOKEN', 'TOKEN_INVALID', 'TOKEN_STALE', 'USER_NOT_FOUND', 'REFRESH_FAILED', 'REFRESH_MISMATCH'].includes(code)
    ) {
      hardResetToLogin('انتهت الجلسة. يُرجى تسجيل الدخول مرة أخرى.');
    }
    // A denied operation does not invalidate an otherwise valid session.
    if (status === 403 && code === 'BLOCKED') {
      hardResetToLogin('ليست لهذا الحساب صلاحية الدخول.');
    }

    return Promise.reject(error);
  }
);

// ملاحظة عربية
window.addEventListener('storage', (e) => {
  if (e.key === 'LOGOUT_BROADCAST' && e.newValue) {
    // ملاحظة عربية
    window.location.assign('/');
  }
});

export default api;
