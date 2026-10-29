// src/Components/Routes/CRoutes.jsx
import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';

import LoginPage from '../Auth/LoginPage/LoginPage';
import RegisterPage from '../Auth/RegisterPage/RegisterPage';

import Header from '../Header/Header';

import RequireAuth from './RequireAuth';
import PublicOnly from './PublicOnly';
import RoleGuard from './RoleGuard';
import NoticesBoard from '../Notice/NoticesBoard';
import AuditPage from '../Audit/AuditPage';

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
import ViewAllVehicle from '../Vehicle/ViewAllVehicle';
import EditVehicle from '../Vehicle/EditVehicle';
import SportPage from '../Sport/SportPage';
import FloatingAIButton from '../AI/FloatingAIButton';
import { canStored } from '../../utils/session';
import PrivacyPage from '../Privacy/PrivacyPage';
import GuidePage from '../../guide/GuidePage';
import { TourProvider } from '../../tours/TourProvider';
import TrainingBanner from '../../journey/TrainingBanner';
import { useDemo } from '../../journey/demoMode';
import { JourneyProvider } from '../../journey/JourneyProvider';
import LiveEventsProvider from '../../locks/LiveEventsProvider';

// The assistant (alerts now, chat later) shows for accounts with ai.use.

function ProtectedLayout() {
  // Training mode: every start and stop changes the epoch, so the screens (and
  // the header's notices bell and the assistant's alerts) remount and reload
  // from the right source, never mixing demo and real data.
  const { epoch } = useDemo();
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {/* The journey wraps the help center: every «أرني» and «ابدأ» runs it. */}
      <LiveEventsProvider />
      <JourneyProvider>
        <TourProvider>
          <TrainingBanner />
          <Header key={`header-${epoch}`} />
          <Outlet key={`outlet-${epoch}`} />
          {/* {canStored("ai.use") && <FloatingAIButton key={`ai-${epoch}`} />} */}
        </TourProvider>
      </JourneyProvider>
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
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/register-student/:token" element={<EditStudent parent={true} />} />
      {/* عربيالجمعةالثلاثاءعربي */}
      <Route element={<RequireAuth />}>
        <Route element={<ProtectedLayout />}>
          {/* ادارة الاثنينعربيالاثنينالأربعاء */}
          <Route path='/dashboard' element={<Dashboard />} />
          <Route path='/guide' element={<GuidePage />} />
          <Route element={<RoleGuard />}>
            <Route path="/calendar" element={<AttendancePage />} />
            
            <Route path="/students" element={<ViewAllStudent />} />
            <Route path="/students/:id" element={<EditStudent/>} />

            <Route path="/users" element={<ViewAllUser />} />
            <Route path="/users/:id" element={<EditUser/>} />

            <Route path="/lessons" element={<ViewAllLesson/>} />
            <Route path="/lessons/:id" element={<EditLesson/>} />

            <Route path="/reports" element={<ViewAllReport/>} />
            <Route path="/reports/:id" element={<EditReport/>} />

            <Route path="/vehicles" element={<ViewAllVehicle/>} />
            <Route path="/vehicles/:id" element={<EditVehicle/>} />

            <Route path="/sports" element={<SportPage/>} />

            <Route path="/notices" element={<NoticesBoard/>} />
            <Route path="/audit" element={<AuditPage/>} />

            <Route path="/files" element={<FilesPage/>} />
            <Route path="/profile" element={<Profile/>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
