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

import { Calendar } from '../Calendar/Calendar';

import ViewAllLesson from '../Lesson/ViewAllLesson';
import EditLesson from '../Lesson/EditLesson';

import ReportWordPage from '../Editor/OnlyOffice/ReportWordPage';
import { setAuthTokens } from '../../WebServer/services/api';
import ViewAllReport from '../Report/ViewAllReport';
import EditReport from '../Report/EditReport';
import Profile from '../Profile/Profile';
import GoogleDrive from '../GoogleDrive/GoogleDrive';
import ViewAllAttendance from '../Attendance/ViewAllAttendance';

function ProtectedLayout() {
  // Header רק בדפים מוגנים
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Header />
      <Outlet />
    </div>
  );
}

function BlankLayout() {
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Outlet />
    </div>
  );
}

export default function CRoutes() {
  const token = localStorage.getItem("accessToken");
  token && setAuthTokens(token);
  return (
    <Routes>
      {/* ציבורי */}
      <Route path="/" element={<PublicOnly/>} />
      <Route path="/login" element={<PublicOnly/>} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/parent-register" element={<EditStudent parent={true} />} />
      {/* מוגן */}
      <Route element={<RequireAuth />}>
        <Route element={<ProtectedLayout />}>
          {/* ادارة בלבד */}
          {/* <Route element={<RoleGuard allows={['ادارة', 'مرشد', 'مساعد']} />}> */}
          <Route>
            <Route path="/calendar" element={<ViewAllAttendance />} />
            {/* <Route path="/calendar/:id" element={<Calendar />} /> */}

            <Route path="/students" element={<ViewAllStudent />} />
            <Route path="/students/:id" element={<EditStudent/>} />

            <Route path="/users" element={<ViewAllUser />} />
            <Route path="/users/:id" element={<EditUser/>} />

            <Route path="/lessons" element={<ViewAllLesson/>} />
            <Route path="/lessons/:id" element={<EditLesson/>} />

            <Route path="/reports" element={<ViewAllReport/>} />
            <Route path="/reports/:id" element={<EditReport/>} />

            <Route path="/drive" element={<GoogleDrive/>} />
            <Route path="/profile" element={<Profile/>} />
          </Route>

          {/* ברירת מחדל פנימית – אם נכנסו ל-root בעודך מחובר */}
          <Route path="/" element={<Navigate to="/calendar" replace />} />
        </Route>
        <Route element={<BlankLayout />}>
          <Route path="/report-editor/:id" element={<ReportWordPage/>} />
        </Route>
      </Route>
    </Routes>
  );
}
