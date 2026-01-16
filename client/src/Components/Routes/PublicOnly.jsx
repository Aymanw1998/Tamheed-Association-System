// src/Components/Routes/PublicOnly.jsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginPage from '../Auth/LoginPage/LoginPage';

import axios from 'axios';
import { API_BASE_URL, setAuthTokens } from '../../WebServer/services/api';
import { scheduleAccessRefresh } from '../../WebServer/utils/accessScheduler';
import { getAccessExpiryMs } from '../../WebServer/utils/authTiming';
import { getLogoutDeadline, scheduleAutoLogout } from '../../WebServer/utils/logoutScheduler';

const SKEW_MS = 60_000; // דקה ביטחון

export default function PublicOnly() {
  const [checked, setChecked] = useState(false);
  const navigatingRef = useRef(false);
  const navigate = useNavigate();

  // סנכרון יציאה בין טאבים
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'LOGOUT_BROADCAST') window.location.assign('/');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    let cancel = false;

    (async () => {
      // 1) יש access בתוקף?
      const token = localStorage.getItem("accessToken");
      const expMs = getAccessExpiryMs(token);
      const valid = token && expMs && (Date.now() + SKEW_MS < expMs);

      if (valid && !cancel && !navigatingRef.current) {
        setAuthTokens(token);
        scheduleAccessRefresh(token);

        const deadline = getLogoutDeadline();
        if (deadline) scheduleAutoLogout(deadline);

        navigatingRef.current = true;
        navigate('/calendar', { replace: true });
        return;
      }

      // 2) אין/פג? רענון חד־פעמי בעזרת refresh-cookie
      try {
        const { data } = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        if (!cancel && data?.accessToken && !navigatingRef.current) {
          setAuthTokens(data.accessToken, data.expirationTime);
          scheduleAccessRefresh(data.accessToken);

          const deadline = getLogoutDeadline();
          if (deadline) scheduleAutoLogout(deadline);

          navigatingRef.current = true;
          navigate('/calendar', { replace: true });
          return;
        }
      } catch {
        // אין ריענון → נציג לוגין
      }

      if (!cancel) setChecked(true);
    })();

    return () => { cancel = true; };
  }, [navigate]);

  if (!checked) return null; // אפשר לשים ספינר
  return <LoginPage />;
}
