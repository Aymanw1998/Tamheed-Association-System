// src/WebServer/services/api.js
import axios from 'axios';
import { markSessionExpired } from '../utils/sessionMessages'; // אופציונלי: מציג הודעת "פג תוקף"
import { getApiBaseUrl } from './apiBase';

export const API_BASE_URL = "http://localhost:2025/api";
//getApiBaseUrl();
  //`${process.env.REACT_APP_SERVER_URI || ''}`.replace(/\/+$/, '') + '/api';

// state פנימי של המודול
let accessToken = localStorage.getItem('accessToken') || null;

// עדכון/ניקוי טוקן ב-frontend
export function setAuthTokens(at, expirationTime /* אופציונלי */) {
  accessToken = at || null;
  if (at) {
    localStorage.setItem('accessToken', at);
  } else {
    localStorage.removeItem('accessToken');
  }

  // אם בחרתם לשמור גם תוקף מהשרת (לא חובה אם מפענחים מה-JWT)
  if (expirationTime) {
    localStorage.setItem('accessTokenExp', String(expirationTime));
  } else {
    localStorage.removeItem('accessTokenExp');
  }
}

// נוח לבדיקות/מאגנים
export function getAuthToken() {
  return accessToken;
}

export const publicApi = axios.create({
  // baseURL: API_BASE_URL+ '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
  timeout: 15000,
});
const api = axios.create({
  // baseURL: API_BASE_URL+ '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false, // refresh נעשה בקריאה נפרדת עם credentials:true
  timeout: 15000,
});

let inited = false;
export const initApiBase = async () => {
  if (inited) return;
  const baseUrl = await API_BASE_URL;
  api.defaults.baseURL = baseUrl;
  publicApi.defaults.baseURL = baseUrl;
  inited = true;
}

// יציאה קשיחה + סנכרון טאבים
function hardResetToLogin(reason = 'פג תוקף ההתחברות, אנא התחבר/י שוב') {
  try {
    // הודעת סיבה למסך הלוגין (אם יש util—נשתמש בו; אחרת נשמור בלוקאל)
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
  window.location.assign('/'); // חזרה ללוגין
}

// --- Request Interceptor: מכניס Authorization אם יש ---
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return config;
});

// --- Response Interceptor עם מניעת מרוץ ריענונים ---
let isRefreshing = false;
let refreshWaitQueue = []; // מערך של { resolve, reject, original }

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

    // לא מטפלים פה בכלל בבקשות refresh עצמן – מחזירים את השגיאה למי שקרא
    const isRefreshRequest = typeof original.url === 'string' && original.url.includes('/auth/refresh');
    if (isRefreshRequest) {
      return Promise.reject(error);
    }

    // 401 TOKEN_EXPIRED → ניסיון ריענון יחיד, עם single-flight
    if (status === 401 && code === 'TOKEN_EXPIRED' && !original.__isRetry) {
      original.__isRetry = true;

      if (isRefreshing) {
        // מחכים שהריענון הנוכחי יסתיים, ואז מריצים מחדש את הבקשה
        return enqueueWaiter(original);
      }

      isRefreshing = true;
      try {
        // refresh עם cookie httpOnly → חייב credentials:true
        const { data } = await axios.post(`${API_BASE_URL+ '/api'}/auth/refresh`, null, {
          withCredentials: true,
        });

        if (!data?.accessToken) {
          throw new Error('No accessToken from refresh');
        }

        // שומרים את הטוקן החדש
        setAuthTokens(data.accessToken, data.expirationTime);

        // משדרים אירוע רענון למאזינים (למשל accessScheduler)
        try {
          window.dispatchEvent(
            new CustomEvent('ACCESS_TOKEN_REFRESHED', { detail: { accessToken: data.accessToken } })
          );
        } catch {}

        // מריצים מחדש את הבקשה שנכשלה
        flushQueue(null);
        return api.request(original);
      } catch (e) {
        flushQueue(e);
        hardResetToLogin('התחברות פגה תוקף (ריענון נכשל)');
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    // 401/403 אחרים → יציאה קשיחה
    if (
      status === 401 &&
      ['NO_TOKEN', 'TOKEN_INVALID', 'USER_NOT_FOUND', 'REFRESH_FAILED', 'REFRESH_MISMATCH'].includes(code)
    ) {
      hardResetToLogin('אין הרשאה/טוקן לא תקף');
    }
    if (status === 403 && ['BLOCKED', 'FORBIDDEN'].includes(code)) {
      hardResetToLogin('אין הרשאה לביצוע הפעולה');
    }

    return Promise.reject(error);
  }
);

// סנכרון טאבים: אם טאב אחר שינה LOGOUT_BROADCAST → לצאת
window.addEventListener('storage', (e) => {
  if (e.key === 'LOGOUT_BROADCAST' && e.newValue) {
    // הימנע מלופים – רק נווט חזרה ללוגין
    window.location.assign('/');
  }
});

export default api;
