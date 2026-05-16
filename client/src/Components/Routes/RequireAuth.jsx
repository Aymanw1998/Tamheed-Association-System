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
        // ملاحظة عربية
        let token = localStorage.getItem("accessToken");
        const expMs = getAccessExpiryMs(token);
        const valid = token && expMs && (Date.now() + SKEW_MS < expMs);

        // ملاحظة عربية
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

        // ملاحظة عربية
        if (!token) {
          navigate('/', { replace: true, state: { from: location } });
          return;
        }

        // ملاحظة عربية
        const me = await getMe();
        console.log("RequireAuth - fetched user (me):", me);
        if (!alive) return;

        if (!me) {
          console.warn("RequireAuth - no user data, logging out");
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

  if (checking) return null; // ملاحظة عربية
  return <Outlet />;
}
