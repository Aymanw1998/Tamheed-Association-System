import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredPermissions, getStoredUserTz } from '../../utils/session';
import { blockedRedirect } from '../../utils/routeAccess';

// Sends a signed-in user who opens a page their role can't use back to the
// dashboard, or to their profile when it is their own user page. The page
// rules live in utils/routeAccess.js.
export default function RoleGuard() {
  const { pathname } = useLocation();
  const to = blockedRedirect(pathname, getStoredPermissions(), getStoredUserTz());
  if (to) return <Navigate to={to} replace />;
  return <Outlet />;
}
