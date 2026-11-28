import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { navigate, usePath } from "./router.jsx";

// Who is signed in: { name } or null for a guest. Guests read; adding,
// editing and building a list need the sign-in (owner, 2026-11-27).
const SessionContext = createContext({ user: null, loading: true, setUser: () => {}, signOut: async () => {} });

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.setSignedOutHandler(() => setUser(null));
    Promise.resolve(api.getMe()).then((res) => {
      if (!alive) return;
      setUser(res?.ok && res.data?.user ? res.data.user : null);
      setLoading(false);
    }, () => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, setUser, signOut }), [user, loading, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

// The sign-in address that comes back here afterwards.
export const loginPath = (back) => `/login?next=${encodeURIComponent(back || "/")}`;

// Only a path on this site: never another host ("//x", "/\x") or a scheme.
export function safeNext(value) {
  const next = String(value || "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

// A staff-only screen: a guest is sent to the sign-in, and nothing is shown.
export function StaffOnly({ children }) {
  const { user, loading } = useSession();
  const path = usePath();
  useEffect(() => {
    if (!loading && !user) navigate(loginPath(path));
  }, [loading, user, path]);
  if (loading) return <p className="center muted">جارٍ التحميل…</p>;
  return user ? children : null;
}
