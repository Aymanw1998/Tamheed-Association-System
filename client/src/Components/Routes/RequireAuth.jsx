// RequireAuth.jsx
import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL, setAuthTokens } from '../../WebServer/services/api';
import { scheduleAccessRefresh } from '../../WebServer/utils/accessScheduler';
import { getAccessExpiryMs } from '../../WebServer/utils/authTiming';
import { getLogoutDeadline, scheduleAutoLogout } from '../../WebServer/utils/logoutScheduler';
import { getMe } from '../../WebServer/services/auth/fuctionsAuth';

const SKEW_MS = 60_000;

export default function RequireAuth() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 1) בדיקת access מקומי
        let token = localStorage.getItem("accessToken");
        const expMs = getAccessExpiryMs(token);
        const valid = token && expMs && (Date.now() + SKEW_MS < expMs);

        // 2) אם לא תקף -> נסה refresh-cookie
        if (!valid) {
          try {
            const { data } = await axios.post(
              `${API_BASE_URL}/auth/refresh`,
              {},
              { withCredentials: true }
            );

            if (data?.accessToken) {
              setAuthTokens(data.accessToken, data.expirationTime);
              scheduleAccessRefresh(data.accessToken);

              const deadline = getLogoutDeadline();
              if (deadline) scheduleAutoLogout(deadline);

              token = data.accessToken;
            } else {
              token = null;
            }
          } catch {
            token = null;
          }
        }

        if (!alive) return;

        // 3) אם עדיין אין token -> ללוגין
        if (!token) {
          navigate('/', { replace: true, state: { from: location } });
          return;
        }

        // 4) בדיקת משתמש
        const me = await getMe().catch(() => null);

        if (!alive) return;

        if (!me) {
          localStorage.removeItem('accessToken');
          navigate('/', { replace: true, state: { from: location } });
          return;
        }
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => { alive = false; };
  }, [location.pathname, navigate]);

  if (checking) return null; // ספינר
  return <Outlet />;
}
