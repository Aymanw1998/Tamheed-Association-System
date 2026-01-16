// accessScheduler.js
import axios from 'axios';
import { API_BASE_URL, setAuthTokens } from '../services/api';
import { getAccessExpiryMs } from './authTiming';
import { getLogoutDeadline } from './logoutScheduler';

let refreshTimerId = null;

export function scheduleAccessRefresh(accessToken, skewMs = 60_000) {
  clearAccessRefresh();

  const expMs = getAccessExpiryMs(accessToken);
  if (!expMs) return;

  const logoutAt = getLogoutDeadline(); // epoch ms או null
  const nextPlanned = expMs - Date.now() - skewMs;
  const timeToLogout = logoutAt ? logoutAt - Date.now() : Infinity;

  const delay = Math.max(Math.min(nextPlanned, timeToLogout - 5_000), 0);
  if (!Number.isFinite(delay) || delay <= 0) return;

  refreshTimerId = setTimeout(async () => {
    // רגע לפני רענון – אם עבר הדדליין, יוצאים
    const now = Date.now();
    const logoutDeadline = getLogoutDeadline();
    if (logoutDeadline && now >= logoutDeadline - 2_000) {
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
      window.location.assign('/');
      return;
    }

    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true });
      if (data?.accessToken) {
        setAuthTokens(data.accessToken, data.expirationTime);

        // ⚠️ חדש: לשדר אירוע רענון (מי שלא משתמש – פשוט יתעלם)
        window.dispatchEvent(new CustomEvent('ACCESS_TOKEN_REFRESHED', {
          detail: { accessToken: data.accessToken }
        }));

        // תזמון מחדש לפי הטוקן החדש
        scheduleAccessRefresh(data.accessToken, skewMs);
      } else {
        hardResetToLogin();
      }
    } catch {
      hardResetToLogin();
    }
  }, delay);
}

export function clearAccessRefresh() {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
}

export function bindAccessTokenRefreshListener() {
  window.addEventListener('ACCESS_TOKEN_REFRESHED', (e) => {
    const token = e?.detail?.accessToken;
    if (token) scheduleAccessRefresh(token);
  });
}

function hardResetToLogin() {
  try { 
    localStorage.clear(); 
    sessionStorage.clear(); 
    localStorage.setItem('LOGOUT_BROADCAST', String(Date.now())); 
  } catch {}
  window.location.assign('/');
}
