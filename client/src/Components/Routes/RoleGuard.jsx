import React  from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getStoredRoles } from '../../utils/session';

export default function RoleGuard({ allows = [] }) {
  const roles = getStoredRoles();
  const isAllowed = Array.isArray(allows) && allows.some((role) => roles.includes(role));
  if(!isAllowed){
      return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
