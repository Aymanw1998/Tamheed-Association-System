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
  
  
  const [selectLesson, setSelectLesson] = useState(null);
  useEffect(()=>{console.log("selectLesson", selectLesson); loadStudents()},[selectLesson]);
  const [selectStudents, setSelectStudents] = useState(null);
  useEffect(()=>console.log("selectStudents", selectStudents), [selectStudents]);

  const loadLessons = async() => {
    console.log("ViewAllloadLessonsssss");
    const day = new Date().getDay() + 1;
    const teacher = localStorage.getItem("user_id");
    const res = await getLessonsByQuery({day: 1});
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

  useEffect(()=>{loadLessons()}, []);

  const formatYMD = (r) => `${String(r.day).padStart(2,"0")}/${String(r.month).padStart(2,"0")}/${r.year}`;

  return(
    <div>
      <center><h1>حضور وغياب لليوم</h1></center>
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
const ViewHistoryLessonByUser = ({users=[], }) => {
  const [lessons, setLessons] = useState([]);
  useEffect(()=>console.log("lessons: ", lessons), [lessons]);

  const getNameDay= (i) => {
    if( i < 1 || i > 7) return "لا يوجد"
    return ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][i-1]
  }
  const getTimesLesson = (startMin, endMin) => {
    const start = {hh: String(parseInt(startMin / 60)).padStart(2, "0"), mm: String(parseInt(startMin % 60)).padStart(2, "0") }
    const end = {hh: String(parseInt(endMin / 60)).padStart(2, "0"), mm: String(parseInt(endMin % 60)).padStart(2, "0") }
    return `${start.hh}:${start.mm} - ${end.hh}:${end.mm}`;
  }
  const loadLessons = async() => {
    if(users == null) return;
    if(users.length === 0) return;
    setLoading(true)
    try{
      const res = await getAllLesson();
      let lessonList = [];
      if(res.ok) {
        console.log("res lessons", users )
        for(const user of users){
          lessonList = [...lessonList, ...res.lessons.filter((l) => l.teacher == user._id || l.helper == user._id)];
        }
        console.log("res lessons", lessonList )
        lessonList.length > 0 ? setLessons(lessonList): setLessons(res.lessons);
      }
    } catch(err) {
      console.error(err)
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(()=>{loadLessons()},[users])

  const [teachers, setTeachers] = useState([]);
  const [helpers, setHelpers] = useState([]);
  const loadTeacherAndHelper = async() => {
    //teachers
    try{
      const res = await getUsers();
      res.ok ? setTeachers(res.users.filter(u => u.roles[0] == "مرشد")): setTeachers([]);
    } catch(err) {
      setTeachers([])
    }

    try{
      const res = await getUsers();
      res.ok ? setHelpers(res.users.filter(u => u.roles[0] == "مساعد")): setHelpers([]);
    } catch(err) {
      setHelpers([])
    }
  }

  const getUserInfo = (_id) => {
    const users = [...teachers, ...helpers];
    const u = users.filter(u=> u._id == _id);
    if(u.length > 0) return u[0].firstname + " " + u[0].lastname;
    return "لا يوجد";
  }

  useEffect(()=>{lessons && loadTeacherAndHelper()}, [lessons])
  
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("name");      // "name" | "price"
  const [sortDir, setSortDir] = useState("asc");           // "asc" | "desc"
  const [loading, setLoading] = useState(false);

  const sortedFilteredLessons = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
  
    const filtered = q
      ? lessons.filter(l =>
          [l.name, teachers.filter(t=> t._id == l.teacher).length > 0 && teachers.filter(t=> t._id == l.teacher)[0].firstname, teachers.filter(t=> t._id == l.teacher).length > 0 && teachers.filter(t=> t._id == l.teacher)[0].lastname, 
            helpers.filter(t=> t._id == l.helper).length > 0 && helpers.filter(t=> t._id == l.helper)[0].firstname, helpers.filter(t=> t._id == l.helpers).length > 0 && helpers.filter(t=> t._id == l.helpers)[0].lastname, 
            getNameDay(l.date.day), getTimesLesson(l.date.startMin, l.date.endMin)]
            .map(v => String(v ?? "").toLowerCase())
            .join(" ")
            .includes(q)
        )
      : lessons;

    const dirMul = sortDir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortField === "info") {
        const an = String(a.info ?? "");
        const bn = String(b.info ?? "");
        return an.localeCompare(bn, "he", { sensitivity: "base" }) * dirMul;
      }
      // name (ברירת מחדל)
      const an = String(a.name ?? "");
      const bn = String(b.name ?? "");
      return an.localeCompare(bn, "he", { sensitivity: "base" }) * dirMul;
    }).sort((a,b)=> {
      let bb = a.date.day - b.date.day;
      if(bb !== 0){
        return bb;
      }

      bb = a.date.startMin - b.date.startMin;
      return bb;
    });
  }, [lessons, searchTerm]);
  
  return(
  <>
      <div >
        <h1 style={{ textAlign: "center"}}>سجل الحضور والغياب</h1>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="بحث..."
            style={{
              width: "80%", padding: "10px", margin: "10px", marginBottom: "20px",fontSize: "14px", 
              border: "1px solid #ccc",borderRadius: "8px"
            }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <button
            style={{ backgroundColor: '#374151', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
            onClick={loadLessons}
            disabled={loading}
          >
            {loading ? "جاري التحديث" : "🔄 تحديث القائمة"}
          </button>
        </div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
        مجموع: {sortedFilteredLessons && sortedFilteredLessons.length > 0 ? sortedFilteredLessons.length: 0} الدروس
      </div>
      </div>

    {(
      <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>رقم</th>
            <th>الدرس</th>
            <th>المرشد</th>
            <th>المساعد</th>
            <th>يوم</th>
            <th>ساعة</th>
            <th>للعملومات</th>
          </tr>
        </thead>
        <tbody>
          {sortedFilteredLessons.length > 0 ? (
            sortedFilteredLessons.map((t,idx) => (
              <tr key={idx}>
                <td data-label="رقم">{idx+1}</td>
                <td data-label="الدرس">{t.name}</td>
                <td data-label="المرشد">{getUserInfo(t?.teacher)}</td>
                <td data-label="المساعد">{getUserInfo(t?.helper)}</td>
                <td data-label="يوم">{getNameDay(t.date.day)}</td>
                <td data-label="ساعة">{getTimesLesson(t.date.startMin, t.date.endMin)}</td>
                <td data-label="للعملومات"></td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: 16 }}>لا يوجد بيانات لاظهاره</td>
            </tr>
          )}
        </tbody>
      </table>)}
  </>)
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
