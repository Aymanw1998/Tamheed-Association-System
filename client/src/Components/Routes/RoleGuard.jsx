import React  from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getMe } from '../../WebServer/services/auth/fuctionsAuth';

export default function RoleGuard({ allows = [] }) {
  
  
  const roles = localStorage.getItem('roles') || localStorage.getItem('role');
  console.log("RoleGuard roles", roles, "allows", allows);
  if(!allows.includes(roles)){
      return <Navigate to="/calendar" replace />;
  }
  return <Outlet />;
}
