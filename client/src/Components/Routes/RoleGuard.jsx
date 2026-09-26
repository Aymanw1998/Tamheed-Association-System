import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredRoles } from '../../utils/session';
import { canAccessPath } from '../../utils/routeAccess';

// Sends a signed-in user who opens a page their role can't use back to the
// dashboard. The page rules live in utils/routeAccess.js.
export default function RoleGuard() {
  const { pathname } = useLocation();
  if (!canAccessPath(pathname, getStoredRoles())) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
