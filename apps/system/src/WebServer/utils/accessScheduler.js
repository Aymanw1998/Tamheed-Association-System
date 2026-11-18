// accessScheduler.js
import { refreshSession, setAuthTokens } from '../services/api';
import { getAccessExpiryMs } from './authTiming';
import { getLogoutDeadline } from './logoutScheduler';
import { clearApiCache } from '../../pwa/clearApiCache';
import { dropDevicePush } from '../../pwa/pushOptIn';
import { clearStorageKeepingTextSize } from '../../utils/textSize';
import { isConnectionFailure, mayStayOffline } from './authNetwork';

// No connection when the token is due: try again in a while, or as soon as
// the connection is back, instead of signing out and wiping the device
// (Codex full review, 2026-11-18).
export const RETRY_OFFLINE_MS = 30_000;

let refreshTimerId = null;

export function scheduleAccessRefresh(accessToken, skewMs = 60_000) {
  clearAccessRefresh();

  const expMs = getAccessExpiryMs(accessToken);
  if (!expMs) return;

  const logoutAt = getLogoutDeadline(); // epoch ms الأحدالجمعة null
  const nextPlanned = expMs - Date.now() - skewMs;
  const timeToLogout = logoutAt ? logoutAt - Date.now() : Infinity;

  const delay = Math.max(Math.min(nextPlanned, timeToLogout - 5_000), 0);
  if (!Number.isFinite(delay) || delay <= 0) return;

  refreshTimerId = setTimeout(() => refreshNow(accessToken, skewMs), delay);
}

async function refreshNow(accessToken, skewMs) {
  {
    // The session's own end has come: sign out, connection or not.
    const now = Date.now();
    const logoutDeadline = getLogoutDeadline();
    if (logoutDeadline && now >= logoutDeadline - 2_000) {
      clearApiCache();
      dropDevicePush();
      try { clearStorageKeepingTextSize(); sessionStorage.clear(); } catch {}
      window.location.assign('/');
      return;
    }

    try {
      const data = await refreshSession();
      if (data?.accessToken) {
        window.removeEventListener('online', retryWhenOnline);
        setAuthTokens(data.accessToken, data.expirationTime);

        // ملاحظة عربية
        window.dispatchEvent(new CustomEvent('ACCESS_TOKEN_REFRESHED', {
          detail: { accessToken: data.accessToken }
        }));

        // ملاحظة عربية
        scheduleAccessRefresh(data.accessToken, skewMs);
      } else {
        hardResetToLogin();
      }
    } catch (err) {
      if (isConnectionFailure(err) && mayStayOffline()) {
        retryLater(accessToken, skewMs);
        return;
      }
      hardResetToLogin();
    }
  }
}

let retryArgs = null;
function retryWhenOnline() {
  window.removeEventListener('online', retryWhenOnline);
  if (!retryArgs) return;
  clearAccessRefresh();
  refreshNow(...retryArgs);
}
function retryLater(accessToken, skewMs) {
  retryArgs = [accessToken, skewMs];
  clearAccessRefresh();
  refreshTimerId = setTimeout(() => refreshNow(accessToken, skewMs), RETRY_OFFLINE_MS);
  window.removeEventListener('online', retryWhenOnline);
  window.addEventListener('online', retryWhenOnline);
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
  clearApiCache();
  dropDevicePush();
  try { 
    clearStorageKeepingTextSize(); 
    sessionStorage.clear(); 
    localStorage.setItem('LOGOUT_BROADCAST', String(Date.now())); 
  } catch {}
  window.location.assign('/');
}
