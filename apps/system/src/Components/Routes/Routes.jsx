import PasskeyOffer from "../Auth/PasskeyOffer.jsx";
// src/Components/Routes/CRoutes.jsx
import React, { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';

import LoginPage from '../Auth/LoginPage/LoginPage';

import Header from '../Header/Header';
import NavigationHistory from './NavigationHistory';

import RequireAuth from './RequireAuth';
import PublicOnly from './PublicOnly';
import RoleGuard from './RoleGuard';

import RecordRoute from './RecordRoute';



import { setAuthTokens } from '../../WebServer/services/api';

import { canStored } from '../../utils/session';
import TrainingBanner from '../../journey/TrainingBanner';
import { useDemo } from '../../journey/demoMode';
import useOwnAccessLive, { usePermissionsVersion } from './useOwnAccessLive';
import useAccessUpdates from './AccessChangeNotice';
import GuidanceProviders from './GuidanceProviders';
import LiveEventsProvider from '../../locks/LiveEventsProvider';
import { lazyPage } from '../../utils/lazyPage';

const RegisterPage = lazyPage(() => import('../Auth/RegisterPage/RegisterPage'));
const NoticesBoard = lazyPage(() => import('../Notice/NoticesBoard'));
const ViewAllStudent = lazyPage(() => import('../Student/ViewAllStudent'));
const EditStudent = lazyPage(() => import('../Student/EditStudent'));
const StudentView = lazyPage(() => import('../Student/StudentView'));
const ViewAllUser = lazyPage(() => import('../User/ViewAllUser'));
const EditUser = lazyPage(() => import('../User/EditUser'));
const UserView = lazyPage(() => import('../User/UserView'));
const ViewAllLesson = lazyPage(() => import('../Lesson/ViewAllLesson'));
const EditLesson = lazyPage(() => import('../Lesson/EditLesson'));
const LessonView = lazyPage(() => import('../Lesson/LessonView'));
const Dashboard = lazyPage(() => import('../Dashboard/Dashboard'));
const ViewAllReport = lazyPage(() => import('../Report/ViewAllReport'));
const EditReport = lazyPage(() => import('../Report/EditReport'));
const ProfilePage = lazyPage(() => import('../Profile/ProfilePage'));
const AttendancePage = lazyPage(() => import('../Attendance/AttendancePage'));
const FilesPage = lazyPage(() => import('../Files/FilesPage'));
const ViewAllVehicle = lazyPage(() => import('../Vehicle/ViewAllVehicle'));
const EditVehicle = lazyPage(() => import('../Vehicle/EditVehicle'));
const SportPage = lazyPage(() => import('../Sport/SportPage'));
const PrivacyPage = lazyPage(() => import('../Privacy/PrivacyPage'));
const GuidePage = lazyPage(() => import('../../guide/GuidePage'));

const LessonsHub = lazyPage(() => import('../Lesson/LessonsHub'));
const WeeklyTasksPage = lazyPage(() => import('../WeeklyTasks/WeeklyTasksPage'));
const ManageWeeklyTasks = lazyPage(() => import('../WeeklyTasks/ManageWeeklyTasks'));
const WeeklyPraise = lazyPage(() => import('../WeeklyTasks/WeeklyPraise'));
const PageLoading = () => <div role="status" style={{ padding: 24, textAlign: "center" }}>جارٍ التحميل…</div>;

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
        <NavigationHistory />
        <PasskeyOffer />
        <Suspense fallback={null}><WeeklyPraise /></Suspense>
        {notice}
        <Suspense fallback={<PageLoading />}><Outlet key={`outlet-${epoch}-${applied}`} /></Suspense>
        {/* {canStored("ai.use") && <FloatingAIButton key={`ai-${epoch}`} />} */}
      </GuidanceProviders>
    </div>
  );
}

export default function CRoutes() {
  const token = localStorage.getItem("accessToken");
  token && setAuthTokens(token);
  return (
    <Suspense fallback={<PageLoading />}>
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
            <Route path="/calendar" element={<LessonsHub active="attendance"><AttendancePage /></LessonsHub>} />
            
            <Route path="/students" element={<ViewAllStudent />} />
            {/* A record opens on its read-only page; /new and /:id/edit open the form. */}
            <Route path="/students/:id" element={<RecordRoute view={<StudentView/>} form={<EditStudent/>} />} />
            <Route path="/students/:id/edit" element={<EditStudent/>} />

            <Route path="/users" element={<ViewAllUser />} />
            <Route path="/users/:id" element={<RecordRoute view={<UserView/>} form={<EditUser/>} />} />
            <Route path="/users/:id/edit" element={<EditUser/>} />

            <Route path="/lessons" element={<LessonsHub active="lessons"><ViewAllLesson/></LessonsHub>} />
            <Route path="/lessons/:id" element={<RecordRoute view={<LessonView/>} form={<EditLesson/>} />} />
            <Route path="/lessons/:id/edit" element={<EditLesson/>} />

            <Route path="/reports" element={<ViewAllReport/>} />
            <Route path="/reports/:id" element={<EditReport/>} />

            <Route path="/vehicles" element={<ViewAllVehicle/>} />
            <Route path="/vehicles/:id" element={<EditVehicle/>} />

            <Route path="/sports" element={<SportPage/>} />

            <Route path="/notices" element={<NoticesBoard/>} />
            <Route path="/weekly-tasks" element={<WeeklyTasksPage/>} />
            <Route path="/weekly-tasks/manage" element={<ManageWeeklyTasks/>} />

            <Route path="/files" element={<FilesPage/>} />
            <Route path="/profile" element={<ProfilePage/>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}
