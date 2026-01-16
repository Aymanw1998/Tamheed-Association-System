//Calendar.jsx
import React, { useState } from "react";
import PropTypes from "prop-types";
import { toast as createToast, toast, useToast as useSystemToast } from "../../ALERT/SystemToasts";
import styles from "./Calendar.module.css";
import {getAllLesson} from "../../WebServer/services/lesson/functionsLesson.jsx";
import { getAll as getAllStudent } from "../../WebServer/services/student/functionsStudent.jsx";
import { 
  getAllByLessonDayMonthYear as getAllAByLDMY,
  createAttendanceByList as createAllAByLDMYSs,
  } from "../../WebServer/services/attendance/functionsAttendance.jsx";
// import ReportEditor from "../Editor/OnlyOffice/ReportWordPage.jsx";
import { useNavigate } from "react-router-dom";
export const Calendar = () => {

  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Popup states
  const [showPopup, setShowPopup] = useState(false);
  const [showPopup2, setShowPopup2] = useState(false);
  const [showPopup3, setShowPopup3] = useState(false);

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedDayEvents, setSelectedDayEvents] = useState([]);
  console.log("selectedDayEvents", selectedDayEvents);
  const [selectedLesson, setSelectedLesson] = useState({});
  console.log("selectedLesson", selectedLesson);
  const [students, setStudents] = useState([]);
  console.log("students", students);
  const [attendances, setAttendances] = useState([]);
  console.log("attendances", attendances);



  const { push } = useSystemToast();

  const monthNames = ["1","2","3","4","5","6","7","8","9","10","11","12"];

  const daysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => {
      if (prev === 0) {
        setCurrentYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => {
      if (prev === 11) {
        setCurrentYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  // 🟦 פתיחת רשימת אירועים ליום שנבחר
  const openDayEvents = async(dateKey) => {
    console.log("openDayEvents for", dateKey);
    try{
      const lessonsResponse = await getAllLesson();
      console.log("lessonsResponse", lessonsResponse?.lessons);
      if (!lessonsResponse?.ok) throw new Error(lessonsResponse?.message || 'خطأ في جلب الدروس');
      const allLessons = lessonsResponse.lessons || [];
      const list = allLessons.filter(lesson => {
        // המרת day/month/year מ־lesson.date לתאריך מלא
        if (!lesson?.date) return false;
        const day = Number(lesson.date.day);
        if ([day].some(isNaN)) return false;
        const lessonDateKey = day;
        console.log("comparing", lessonDateKey, new Date(dateKey).getDay()+1);
        return lessonDateKey === new Date(dateKey).getDay()+1;
      }).map(lesson => ({
        ...lesson,
      }));
      console.log("Events for", dateKey, list);
      setSelectedDayEvents(list);
      setSelectedDate(dateKey);
      setShowPopup(true);
    }catch(err){
      console.error("Error fetching events for date", dateKey, err);
      push(createToast("error", "حدث خطأ أثناء جلب الأحداث", { duration: 3000 }));
      toast.error("حدث خطأ أثناء جلب الأحداث", { duration: 3000 });
    }
  };

  // 🟦 פתיחת רשימת אירועים ליום שנבחר
  const openAttendance = async(lesson, date) => {
    setSelectedLesson(lesson);
    console.log("openAttendance for", lesson, date);
    try{
      // קבלת רשימת הסטודנטים של השיעור
      const studentsResponse = await getAllStudent();
      console.log("studentsResponse", studentsResponse?.students);
      if (!studentsResponse?.ok) throw new Error(studentsResponse?.message || 'خطأ في جلب الطلاب');
      const allStudents = studentsResponse.students || [];
      const list = allStudents.filter(student => lesson.list_students.includes(student._id)).map(student => ({
        ...student,
      }));
      console.log("Students for attendance", list);
      setStudents(list);

      // קבלת רשימת הנוכחות של השיעור בתאריך הנתון
      const [year, month, day] = date.split("-").map(Number);
      const attendanceResponse = await getAllAByLDMY(lesson._id, day, month, year); 
      console.log("attendanceResponse", attendanceResponse?.attendances);
      if (!attendanceResponse?.ok) throw new Error(attendanceResponse?.message || 'خطأ في جلب الحضور');
      const defaultAttendances = list.map(student => ({
        lesson: lesson._id,
        student: student._id,
        status: false,
        day: day,
        month: month,
        year: year,
      }));
      console.log("defaultAttendances", defaultAttendances);
      const allAttendances = attendanceResponse.attendances.length > 0 ? attendanceResponse.attendances : defaultAttendances;
      setAttendances(allAttendances);

      setShowPopup3(true);
    }catch(err){
      console.error("Error fetching students for attendance", err);
      // push(createToast("error", "حدث خطأ أثناء جلب الطلاب", { duration: 3000 }));
      toast.error("حدث خطأ أثناء جلب الطلاب", { duration: 3000 });
    }
  };
    
  const openReport = async(lesson, date) => {
    setSelectedLesson(lesson);
    console.log("openReport for", lesson, date);
    window.open('/report-editor/'+`${date}_${lesson.name}`, '_blank')
  };

  const saveAttendance = async(lesson, date) => {
    console.log("createAttendanceListForLesson for", lesson, date);
    try{
      const [year, month, day] = date.split("-").map(Number);
      const attendanceList = attendances.map(a => ({
        lesson: a.lesson,
        student: a.student,
        status: a.status,
        day: day,
        month: month,
        year: year,
      }));
      console.log("attendanceList to create", attendanceList);
      const createResponse = await createAllAByLDMYSs(lesson._id, day, month, year, attendanceList);
      console.log("createResponse", createResponse);
      if (!createResponse?.ok) throw new Error(createResponse?.message || 'خطأ في إنشاء الحضور');
      toast.success("تم حفظ قائمة الحضور والغياب بنجاح", { duration: 2500 });
    }catch(err){
      console.error("Error creating attendance list", err);
      // push({type: "error", message: "حدث خطأ أثناء إنشاء قائمة الحضور", duration: 3000 });
      toast.error("حدث خطأ أثناء إنشاء قائمة الحضور", { duration: 3000 });
    }
  };

  const openLesson = async(lesson) => {
    setShowPopup2(true);
    setSelectedLesson(lesson);
  };


  
  const renderCalendarCells = () => {
    const totalDays = daysInMonth(currentMonth, currentYear);
    const firstDay = firstDayOfMonth(currentMonth, currentYear);

    const cells = [];

    // תאים ריקים לפני היום הראשון בחודש
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className={styles.emptyCell}></div>);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const today = new Date();
      const isToday =
        today.getDate() === day &&
        today.getMonth() === currentMonth &&
        today.getFullYear() === currentYear;

      const dayEvents = []; //events.filter((e) => e.date === dateKey);

      cells.push(
        <div
          key={dateKey}
          className={`${styles.dateCell} ${isToday ? styles.today : ""}`}
          onClick={() => openDayEvents(dateKey)}
        >
          <div className={styles.dateNumber}>{day}</div>

          <div className={styles.eventsContainer}>
            {dayEvents.slice(0, 2).map((event, idx) => (
              <div key={idx} className={styles.eventItem}>
                {event.title}
              </div>
            ))}
            {dayEvents.length > 2 && (
              <div className={styles.moreEvents}>+{dayEvents.length - 2} أحداث</div>
            )}
          </div>
        </div>
      );
    }
    return cells;
  };

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <button onClick={handlePrevMonth} className={styles.navButton}>
          &lt;
        </button>
        <div className={styles.monthYear}>
          {monthNames[currentMonth]}/{currentYear}
        </div>
        <button onClick={handleNextMonth} className={styles.navButton}>
          &gt;
        </button>
      </div>

      <div className={styles.weekDays}>
        {["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((d, i) => (
          <div key={i} className={styles.weekDay}>
            {d}
          </div>
        ))}
      </div>

      <div className={styles.calendarGrid}>{renderCalendarCells()}</div>

        {/* الدروس في اليوم المحدد له */}
      {showPopup && (
        <div className={styles.popupOverlay} onClick={() => setShowPopup(false)}>
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.popupTitle}>أحداث يوم {selectedDate}</h3>

            {selectedDayEvents.length === 0 ? (
              <div className={styles.noEvents}>لا توجد أحداث</div>
            ) : (
              <ul className={styles.eventList}>
                {selectedDayEvents.map((ev, i) => (
                  <li key={i}>
                    <button className={styles.addButton} onClick={()=>openLesson(ev)}>
                    ساعة: {parseInt(Math.floor(ev.date.startMin/60))}:{String(ev.date.startMin%60).padStart(2, "0")} {" --> "} {ev.name}
            </button>
                  </li>
                ))}
              </ul>
            )}
            <button className={styles.closeButton} onClick={() => setShowPopup(false)}>
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/*  اختيار بين التقرير او الحضور والغياب */}
      {showPopup2 && (
        <div className={styles.popupOverlay} onClick={() => setShowPopup2(false)}>
          <div
            className={styles.popup}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.popupTitle}> اختر ما تريد القيام به:</h3>
            <p style={{color: "gray"}}>التاريخ: {selectedDate}, الدرس: {selectedLesson.name}</p>
            <button className={styles.addButton} onClick={() => {setShowPopup2(false); openAttendance(selectedLesson, selectedDate);}}>
              إدارة الحضور والغياب
            </button>
            <button className={styles.addButton} onClick={() => {setShowPopup2(false); openReport(selectedLesson, selectedDate);}}>تقرير</button>
            
            <button className={styles.closeButton} onClick={() => setShowPopup2(false)}>
              إغلاق
            </button>
          </div>
        </div>
      )}

      
      {/*  قائمة الحضور والغياب */}
      {showPopup3 && attendances.length > 0 && (
        <div className={styles.popupOverlay} onClick={() => setShowPopup3(false)}>
          <div
            className={styles.popup}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.popupTitle}>حضور وغياب</h3>
            <p style={{color: "gray"}}>التاريخ: {selectedDate}, الدرس: {selectedLesson.name}</p>

            {students.length === 0 ? (
              <div className={styles.noEvents}>لا توجد أحداث</div>
            ) : (
              <table className={styles.attTable}>
                <thead>
                  <tr>
                    <th>رقم الهوية</th>
                    <th>اسم الطالب</th>
                    <th>الحضور</th>
                    <th>ملاحطة</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st, i) => (
                    <tr key={i}>
                      <td>{st.tz}</td>
                      <td>{st.firstname} {st.lastname}</td>
                      <td className={styles.checkCell}>
                        <input 
                          type="checkbox" 
                          checked={attendances.find(a => String(a.student) === String(st._id)).status}
                          onChange={(e)=>{
                            const updatedAttendances = attendances.map(a => {
                              if(a.student == st._id){
                                return {...a, status: e.target.checked};
                              }
                              return a;
                            });
                            setAttendances(updatedAttendances);
                          }}/>
                      </td>
                      <td>
                        <input type="text" placeholder="ملاحظات" name="notes" value={st.notes} onChange={()=>setStudents(students.map((s)=>{
                          if(s._id === st._id){
                            return {...s, notes: s.notes};
                          }
                        }))}/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button className={styles.addButton} onClick={() => {saveAttendance(selectedLesson, selectedDate);setShowPopup2(false)}}>
              حفظ
            </button>
            <button className={styles.closeButton} onClick={() => setShowPopup3(false)}>
              إغلاق
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
