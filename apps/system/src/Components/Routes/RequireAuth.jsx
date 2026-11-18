// RequireAuth.jsx
import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { refreshSession, setAuthTokens } from '../../WebServer/services/api';
import { scheduleAccessRefresh } from '../../WebServer/utils/accessScheduler';
import { getAccessExpiryMs } from '../../WebServer/utils/authTiming';
import { getLogoutDeadline, scheduleAutoLogout } from '../../WebServer/utils/logoutScheduler';
import { getMeChecked } from '../../WebServer/services/auth/fuctionsAuth';
import { isConnectionFailure, mayStayOffline } from '../../WebServer/utils/authNetwork';
import { rememberSessionUser } from '../../utils/session';
import { syncSavedPasskey } from '../../utils/passkey';

const SKEW_MS = 60_000;

export default function RequireAuth() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [checking, setChecking] = useState(true);
  // Checked again when the connection comes back.
  const [online, setOnline] = useState(0);
  useEffect(() => {
    const back = () => setOnline((n) => n + 1);
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);

  useEffect(() => {
    let alive = true;
    // No connection is not a sign-out: someone already signed in on this
    // device keeps the app (and its drafts) until the server can answer
    // (Codex full review, 2026-11-18).
    let offline = false;
    (async () => {
      try {
        // ملاحظة عربية
        let token = localStorage.getItem("accessToken");
        const expMs = getAccessExpiryMs(token);
        const valid = token && expMs && (Date.now() + SKEW_MS < expMs);

        // ملاحظة عربية
        if (!valid) {
          try {
            const data = await refreshSession();

            if (data?.accessToken) {
              setAuthTokens(data.accessToken, data.expirationTime);
              scheduleAccessRefresh(data.accessToken);

              const deadline = getLogoutDeadline();
              if (deadline) scheduleAutoLogout(deadline);

              token = data.accessToken;
            } else {
              token = null;
            }
          } catch (err) {
            if (isConnectionFailure(err) && mayStayOffline()) offline = true;
            else token = null;
          }
        }
        if (offline) return;

        if (!alive) return;

        // ملاحظة عربية
        if (!token) {
          navigate('/', { replace: true, state: { from: location } });
          return;
        }

        // ملاحظة عربية
        const { me, connectionFailed } = await getMeChecked();
        if (!alive) return;
        if (!me && connectionFailed && mayStayOffline()) return;

        if (!me) {
          localStorage.removeItem('accessToken');
          navigate('/', { replace: true, state: { from: location } });
          return;
        }
        rememberSessionUser(me);
        syncSavedPasskey(me.tz, me.hasPasskey);
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => { alive = false; };
  }, [location.pathname, navigate, online]);

  if (checking) return null; // ملاحظة عربية
  return <Outlet />;
}
