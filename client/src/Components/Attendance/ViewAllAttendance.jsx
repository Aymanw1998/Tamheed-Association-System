import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import styles from "./Attendance.module.css";

import {getMe} from "../../WebServer/services/auth/fuctionsAuth"
import {getUserById, getAll as getUsers} from "../../WebServer/services/user/functionsUser";
import {getAll as getStudents} from "../../WebServer/services/student/functionsStudent";
import {getAllLesson, getLessonsByQuery} from "../../WebServer/services/lesson/functionsLesson";
import {getAll, createAttendanceByList} from "../../WebServer/services/attendance/functionsAttendance"

import AttendanceStatusFilter from "./AttendanceStatusFilter";
import { toast } from "../../ALERT/SystemToasts";
import AttendanceHistory from "./AttendanceHistory";

const AttendanceTable = ({ lessonId, students = [], year, month, day }) => {
  const [loading, setLoading] = useState(false);
  const [attendanceStudents, setAttendanceStudents] = useState([]);

  const STATUS = [
    { value: "حاضر", label: "حاضر ✅" },
    { value: "غائب", label: "غائب ❌" },
    { value: "متأخر", label: "متأخر ⏰" },
  ];

  // Map للطلاب عشان نجيب الاسم بسرعة بدل filter كل مرة
  const studentsMap = useMemo(() => {
    const m = new Map();
    for (const s of students) m.set(String(s._id), s);
    return m;
  }, [students]);

  const initAndFetch = useCallback(async () => {
    if (!lessonId || !year || !month || !day) return;

    // 1) init: كل الطلاب حاضر
    const base = students.map((s) => ({
      student: String(s._id),
      status: "حاضر",
      notes: "",
    }));

    setLoading(true);
    try {
      // 2) fetch attendances من السيرفر
      const res = await getAll({ lessonId, year, month, day });
      if (!res?.ok) {
        setAttendanceStudents(base);
        return;
      }

      // 3) دمج: إذا عنده سجل حضور مسبقًا استبدله
      const serverMap = new Map(
        (res.attendances || []).map((a) => [
          String(a.student),
          { student: String(a.student), status: a.status, notes: a.notes || "" },
        ])
      );

      const merged = base.map((row) => serverMap.get(row.student) ?? row);
      setAttendanceStudents(merged);
    } catch (e) {
      console.error(e);
      setAttendanceStudents(base);
    } finally {
      setLoading(false);
    }
  }, [lessonId, year, month, day, students]);

  useEffect(() => {
    initAndFetch();
  }, [initAndFetch]);

  const updateRow = (studentId, patch) => {
    const id = String(studentId);
    setAttendanceStudents((prev) =>
      prev.map((row) => (row.student === id ? { ...row, ...patch } : row))
    );
  };

  const saveAll = async () => {
    try {
      const res = await createAttendanceByList(
        lessonId,
        day,
        month,
        year,
        attendanceStudents
      );
      if (res?.ok) toast.success("تم تسجيل الحضور بنجاح");
      else toast.error(res?.message || "فشل الحفظ");
    } catch (err) {
      toast.error(err?.message || "خطأ بالحفظ");
    }
  };

  return (
    <>
      <h2 style={{ textAlign: "center" }}>
        جدول الحضور والغياب — {String(day).padStart(2, "0")}/
        {String(month).padStart(2, "0")}/{year}
      </h2>

      <div style={{ marginTop: 8, opacity: 0.7 }}>
        مجموع الطلاب: {students.length} {loading ? "— تحميل..." : ""}
        <button onClick={saveAll} disabled={loading || !attendanceStudents.length}>
          💾 حفظ
        </button>
      </div>

      <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>الطالب</th>
            <th>الحالة</th>
            <th>ملاحظة</th>
          </tr>
        </thead>

        <tbody>
          {attendanceStudents.length ? (
            attendanceStudents.map((row, idx) => {
              const st = studentsMap.get(row.student);
              return (
                <tr key={row.student}>
                  <td data-label="#">{idx + 1}</td>

                  <td data-label="الطالب">
                    {st ? `${st.firstname} ${st.lastname}` : "لا يوجد"}
                  </td>

                  <td data-label="الحالة">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        updateRow(row.student, { status: e.target.value })
                      }
                    >
                      {STATUS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td data-label="ملاحظة">
                    <textarea
                      value={row.notes}
                      onChange={(e) =>
                        updateRow(row.student, { notes: e.target.value })
                      }
                      placeholder="ملاحظة..."
                      style={{ width: "70%" }}
                    />
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", padding: 16 }}>
                لا يوجد طلاب
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
};



const ViewTodayLessonByUser = ({users}) => {
  useEffect(()=>console.log("in ViewTodayLessonByUser"),[])
  const [lessons, setLessons] = useState(
  [{
    name: '',
    date: {day: 1, startMin: 1, endMin: 1},
    teacher: '',
    helper: '',
    list_students:[],
    room: '',
  }]);
  const DAYS = [
    {key:0, value:"كل"},{key:1, value:"الاحد"},{key:2, value:"الاثنين"},{key:3, value:"الثلاثاء"},
    {key:4, value:"الاربعاء"},{key:5, value:"الخميس"},{key:6, value:"الجمعة"},{key:7, value:"السبت"}
  ];
  const [selectDay, setSelectDay] = useState(new Date().getDay() + 1 || 0);
  useEffect(()=>console.log("selectDay", selectDay),[selectDay]);
  const [selectLesson, setSelectLesson] = useState(null);
  useEffect(()=>{console.log("selectLesson", selectLesson); loadStudents()},[selectLesson]);
  const [selectStudents, setSelectStudents] = useState(null);
  useEffect(()=>console.log("selectStudents", selectStudents), [selectStudents]);

  const loadLessons = async() => {
    setSelectLesson(null);
    setSelectStudents(null);
    const day = new Date().getDay() + 1;
    const teacher = localStorage.getItem("user_id");
    const res = await getLessonsByQuery(selectDay > 0 ? {day: selectDay} : {});
    console.log("res", res);
    if(res.ok)  setLessons(res.lessons);
    else        setLessons([]);
  }
  const loadStudents = async() => {
    if(!selectLesson) return;

    const res = await getStudents();
    console.log("res", res);
    if(res.ok)  setSelectStudents(res.students.filter(s=> selectLesson.list_students.includes(s._id)));
    else        setSelectStudents(null);
  }

  useEffect(()=>{loadLessons()}, [selectDay]);

  const formatYMD = (r) => `${String(r.day).padStart(2,"0")}/${String(r.month).padStart(2,"0")}/${r.year}`;

  return(
    <div>
      <center><h1>حضور وغياب لليوم</h1></center>
      <label>اختيار اليوم:</label>
      <select
          name="day"
          value={selectDay}
          onChange={(e)=>{setSelectDay(e.target.value)}}
        >
          {Array.isArray(DAYS) && DAYS.map((d, idx) => (
              <option key={d.key || idx} value={d.key || ""}>
                {d.value}
              </option>
            ))}
        </select>
      <label>اختيار الدرس:</label>
      <select
          name="teacher"
          value={selectLesson?._id}
          onChange={(e)=>{setSelectLesson(lessons.filter(l => l._id == e.target.value)[0])}}
        >
          <option value="">اختيار درس اليوم</option>
          {Array.isArray(lessons) && lessons.map((l, idx) => (
              <option key={l._id || idx} value={l._id || ""}>
                {l.name || "بدون اسم"}
              </option>
            ))}
        </select>

        {selectLesson && selectStudents ? <AttendanceTable key={selectLesson._id} lessonId={selectLesson._id} students={selectStudents} year={new Date().getFullYear()} month={new Date().getMonth() + 1} day={new Date().getDate()}/>: <div key={1}>ERROR</div>}
    </div>
  )
}

const ViewAllAttendance = () => {
  const [users, setUsers] = useState();
  const [status, setStatus] = useState("today");
    const loadMe = async() => {
    try{
      const user = await getMe();
      
      setUsers([user])
    } catch(err) {
      setUser(null);
    }
  }
  useEffect(()=>{loadMe()}, []);
  return (
      <><AttendanceStatusFilter status={status} onChange={setStatus}/>
        {
          status === "today" ? <ViewTodayLessonByUser users={users}/> : <AttendanceHistory/>
        }
      </>);
  return <ViewTodayLessonByUser/>
  //return <ViewAllLessonByUser users={users}/>
};

export default ViewAllAttendance;
