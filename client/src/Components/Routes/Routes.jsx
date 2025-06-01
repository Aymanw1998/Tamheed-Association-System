import React, {useState, useEffect} from 'react'
import { Routes, Route, BrowserRouter, useNavigate } from 'react-router-dom';

import LoginPage from "../Auth/LoginPage/LoginPage"
import CreateStudentPage from "../Student/Create/CreateStudentPage"
import ViewStudentsPage from '../Student/ViewALL/ViewStudentsPage';
import ViewStudentPage from '../Student/ViewOne/ViewStudentPage';
import Header from '../Header/Header';
//Routes
export default function CRoutes() {
        const hasToken = localStorage.getItem("authToken") && localStorage.getItem("tokenExpiry");
    return (
        <>
            {/* {localStorage.getItem('role') && <Header onLogout={handleLogout}/>} */}
            {hasToken && <Header/>}
            {/* {localStorage.getItem("authToken") && localStorage.getItem("tokenExpiry")&& <button onClick={handleLogout}>تسجيل الخروج</button> } */}
            <Routes>
                <Route path='/' element={<LoginPage />}/>
                {<Route path="/dashboard/post" element={ <CreateStudentPage />} /> }
                {<Route path="/dashboard/get" element={ <ViewStudentsPage />}/> }
                {<Route path="/dashboard/get/:tz" element={<ViewStudentPage />} /> }

                {/* <Route path='/register' element={<RegisterForm onLogin={handleLogin}/>}/> */}

                {/* הדפים שמוגנים עבור coach ו-trainee */}
                {/* <Route path="/dashboard" element={ role === "coach" ? <CoachDashboard /> : <TraineeDashboard />} /> */}

                {/* דפים נוספים שמוגנים */}
                {/* <Route path="/calendar" element={<CalendarBooking />}/>
                <Route path="/profile" element={<UserProfile />} />
                <Route path="/trainees" element={<ListTrainees />} /> */}
            </Routes>
        </>
    )
}
