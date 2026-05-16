// src/Components/Routes/CRoutes.jsx
import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';

import LoginPage from '../Auth/LoginPage/LoginPage';
import RegisterPage from '../Auth/RegisterPage/RegisterPage';

import Header from '../Header/Header';

import RequireAuth from './RequireAuth';
import RoleGuard from './RoleGuard';
import PublicOnly from './PublicOnly';

import ViewAllStudent from '../Student/ViewAllStudent';
import EditStudent from '../Student/EditStudent';

import ViewAllUser from '../User/ViewAllUser';
import EditUser from '../User/EditUser';

import ViewAllLesson from '../Lesson/ViewAllLesson';
import EditLesson from '../Lesson/EditLesson';

import { setAuthTokens } from '../../WebServer/services/api';
import Dashboard from '../Dashboard/Dashboard';
import ViewAllReport from '../Report/ViewAllReport';
import EditReport from '../Report/EditReport';
import Profile from '../Profile/Profile';

import AttendancePage from '../Attendance/AttendancePage';
import FilesPage from '../Files/FilesPage';

function ProtectedLayout() {
  // ملاحظة عربية
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Header />
      <Outlet />
    </div>
  );
}

export default function CRoutes() {
  const token = localStorage.getItem("accessToken");
  token && setAuthTokens(token);
  return (
    <Routes>
      {/* ملاحظة عربية */}
      <Route path="/" element={<PublicOnly/>} />
      <Route path="/login" element={<PublicOnly/>} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/parent-register" element={<EditStudent parent={true} />} />
      {/* عربيالجمعةالثلاثاءعربي */}
      <Route element={<RequireAuth />}>
        <Route element={<ProtectedLayout />}>
          {/* ادارة الاثنينعربيالاثنينالأربعاء */}
          {/* <Route element={<RoleGuard allows={['ادارة', 'مرشد', 'مساعد']} />}> */}
          <Route element={<RoleGuard allows={['ادارة']} />}>
          <Route path='/dashboard' element={<Dashboard />} />
          </Route>
          <Route>
            <Route path="/calendar" element={<AttendancePage />} />
            
            <Route path="/students" element={<ViewAllStudent />} />
            <Route path="/students/:id" element={<EditStudent/>} />

            <Route path="/users" element={<ViewAllUser />} />
            <Route path="/users/:id" element={<EditUser/>} />

            <Route path="/lessons" element={<ViewAllLesson/>} />
            <Route path="/lessons/:id" element={<EditLesson/>} />

            <Route path="/reports" element={<ViewAllReport/>} />
            <Route path="/reports/:id" element={<EditReport/>} />

            <Route path="/files" element={<FilesPage/>} />
            <Route path="/profile" element={<Profile/>} />
          </Route>

          {/* ملاحظة عربية */}
          {/* <Route path="/" element={<Navigate to="/calendar" replace />} /> */}
        </Route>
      </Route>
    </Routes>
  );
}
