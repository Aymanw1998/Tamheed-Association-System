import PasskeyOffer from "../Auth/PasskeyOffer.jsx";
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

import ViewAllStudent from '../Student/ViewAllStudent';
import EditStudent from '../Student/EditStudent';
import StudentView from '../Student/StudentView';
import RecordRoute from './RecordRoute';

import ViewAllUser from '../User/ViewAllUser';
import EditUser from '../User/EditUser';
import UserView from '../User/UserView';

import ViewAllLesson from '../Lesson/ViewAllLesson';
import EditLesson from '../Lesson/EditLesson';
import LessonView from '../Lesson/LessonView';

import { setAuthTokens } from '../../WebServer/services/api';
import Dashboard from '../Dashboard/Dashboard';
import ViewAllReport from '../Report/ViewAllReport';
import EditReport from '../Report/EditReport';
import ProfilePage from '../Profile/ProfilePage';

import AttendancePage from '../Attendance/AttendancePage';
import FilesPage from '../Files/FilesPage';
import ViewAllVehicle from '../Vehicle/ViewAllVehicle';
import EditVehicle from '../Vehicle/EditVehicle';
import SportPage from '../Sport/SportPage';
import FloatingAIButton from '../AI/FloatingAIButton';
import { canStored } from '../../utils/session';
import PrivacyPage from '../Privacy/PrivacyPage';
import GuidePage from '../../guide/GuidePage';
import TrainingBanner from '../../journey/TrainingBanner';
import { useDemo } from '../../journey/demoMode';
import useOwnAccessLive, { usePermissionsVersion } from './useOwnAccessLive';
import useAccessUpdates from './AccessChangeNotice';
import GuidanceProviders from './GuidanceProviders';
import LiveEventsProvider from '../../locks/LiveEventsProvider';

// The assistant (alerts now, chat later) shows for accounts with ai.use.

function ProtectedLayout() {
  // Training mode: every start and stop changes the epoch, so the screens (and
  // the header's notices bell and the assistant's alerts) remount and reload
  // from the right source, never mixing demo and real data.
  const { epoch } = useDemo();
  // A change in this user's permissions or role (an admin's edit arrives
  // live, or /auth/me on navigation finds it) redraws the menu at once and
  // the page too, unless it holds unsaved edits; the notice names what
  // changed (owner, 2026-11-02).
  useOwnAccessLive();
  const access = usePermissionsVersion();
  const { applied, notice } = useAccessUpdates();
  return (
    <div style={{ minHeight: "100vh", width: "100vw" }}>
      <LiveEventsProvider />
      <GuidanceProviders>
        <TrainingBanner />
        <Header key={`header-${epoch}-${access}`} />
        <PasskeyOffer />
        {notice}
        <Outlet key={`outlet-${epoch}-${applied}`} />
        {/* {canStored("ai.use") && <FloatingAIButton key={`ai-${epoch}`} />} */}
      </GuidanceProviders>
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
            {/* A record opens on its read-only page; /new and /:id/edit open the form. */}
            <Route path="/students/:id" element={<RecordRoute view={<StudentView/>} form={<EditStudent/>} />} />
            <Route path="/students/:id/edit" element={<EditStudent/>} />

            <Route path="/users" element={<ViewAllUser />} />
            <Route path="/users/:id" element={<RecordRoute view={<UserView/>} form={<EditUser/>} />} />
            <Route path="/users/:id/edit" element={<EditUser/>} />

            <Route path="/lessons" element={<ViewAllLesson/>} />
            <Route path="/lessons/:id" element={<RecordRoute view={<LessonView/>} form={<EditLesson/>} />} />
            <Route path="/lessons/:id/edit" element={<EditLesson/>} />

            <Route path="/reports" element={<ViewAllReport/>} />
            <Route path="/reports/:id" element={<EditReport/>} />

            <Route path="/vehicles" element={<ViewAllVehicle/>} />
            <Route path="/vehicles/:id" element={<EditVehicle/>} />

            <Route path="/sports" element={<SportPage/>} />

            <Route path="/notices" element={<NoticesBoard/>} />

            <Route path="/files" element={<FilesPage/>} />
            <Route path="/profile" element={<ProfilePage/>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
