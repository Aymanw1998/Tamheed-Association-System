import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getOneLesson,
  createLesson,
  updateLesson,
  getAllLesson,
  deleteLesson,
} from '../../WebServer/services/lesson/functionsLesson';
import styles from './EditLesson.module.css';
import { toast } from '../../ALERT/SystemToasts';

import { getAll as getAllS} from '../../WebServer/services/student/functionsStudent';
import { getAll as getAllU } from '../../WebServer/services/user/functionsUser';
const EditLesson = () => {
  
  const { id } = useParams(); // "new" או מזהה שיעור
  
  const navigate = useNavigate();
  const isNew = id === 'new';
  const searchParams = new URLSearchParams(window.location.search);
  const dayFromUrl = Number(searchParams.get('day'))+1 || 1;
  const hhFromUrl = (Number(searchParams.get('startMin'))/60) || 8;
  const monthFromUrl = Number(searchParams.get('month')) || new Date().getMonth()+1;
  const yearFromUrl = Number(searchParams.get('year')) || new Date().getFullYear();

  const [lesson, setLesson] = useState({
    name: '',
    date: { 
      day: dayFromUrl,     
      startMin: hhFromUrl*60,           // אם הגיע 'hh' מה-URL
      endMin:   hhFromUrl*60 + 45,
    },
      teacher: '', 
      helper: '',
      room: '-1',
      list_students: [],
  });
  const [error, setError] = useState({
    name: '',
    date: { day: '', startMin: '', endMin: '' },
    teacher: '',
    helper: '',
    room: '',
    list_students: [],
  });

  // helper להמרת HH:MM <-> דקות
  const toMin = (hhmm) => {
    const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
    return (hh*60 + (mm||0))|0;
  };
  const toHHMM = (min) => {
    const h = Math.floor(min/60);
    const m = min%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };

  // handleChange לשדות שעות
  const handleTimeChange = (name, hhmm) => {
    console.log("handleTimeChange", name, hhmm, toMin(hhmm));
    setLesson(prev => {
      let startMin = prev.date.startMin;
      let endMin   = prev.date.endMin;
      console.log("before", startMin, endMin);
      if (name === 'start') {
        startMin = toMin(hhmm);
        if (endMin <= startMin) endMin = startMin + 45
      } else {
        endMin = toMin(hhmm);
        if (endMin <= startMin + 45) endMin = startMin + 45; // לפחות דקה אחת
      }
      return { ...prev, date: { ...prev.date, startMin, endMin } };
    });
  };
  const [students, setStudents] = useState([]);
  useEffect(()=>console.log("students", students),[students]);
  const [teachers, setTeachers] = useState([]);
  useEffect(()=>console.log("teachers", teachers),[teachers]);
  const [helpers, setHelpers] = useState([]);
  useEffect(()=>console.log("helpers", helpers),[helpers]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTerm2, setSearchTerm2] = useState('');
  const [showTraineeModal, setShowTraineeModal] = useState(false);

  // פרה-פופול לשיעור חדש מה־querystring
  useEffect(() => {
    if (id === 'new') {
      setLesson((prev) => ({
        ...prev,
        date: { ...prev.date, day: dayFromUrl, startMin: hhFromUrl*60, endMin:   hhFromUrl*60 + 45 },
      }));
    }
  }, [id, dayFromUrl, hhFromUrl]);

  // טעינת נתונים
  const loadData = async () => {
    try {
      const usersRes = await getAllU();
      console.log("usersRes", usersRes);
      if (usersRes?.ok) {
        const allUsers = usersRes.users || [];
        setTeachers(allUsers.filter((u) => u.roles.includes('مرشد')));
        // setTrainers(allUsers.filter((u) => u.role === 'מאמן'));
      } else{
        throw new Error(usersRes?.message)
      }
    }
    catch(err){
      console.error(err.message)
    }

    try {
      const usersRes = await getAllU();
      console.log("usersRes", usersRes);
      if (usersRes?.ok) {
        const allUsers = usersRes.users || [];
        setHelpers(allUsers.filter((u) => u.roles.includes('مساعد')));
        // setTrainers(allUsers.filter((u) => u.role === 'מאמן'));
      } else{
        throw new Error(usersRes?.message)
      }
    }
    catch(err){
      console.error(err.message)
    }
    try{
      // לא חובה, אבל משאירים אם תרצה שימוש עתידי
      // await getAllLesson();

      if (id !== 'new') {
        const resL = await getOneLesson(id);
        if(!resL.ok) throw new Error(resL.message);
        const l = resL.lesson;
        console.log("llllllllll", l);
        if (l) {
          setLesson({...l, list_students: l.list_students.filter(t => t != null && t != undefined)});
        } else {
          navigate(-1);
        }
      }
    } catch (e) {
      console.error(e);
      navigate(-1);
    }
    try{
      const resT = await getAllS();
      console.log("resT", resT);
      if(!resT.ok) throw new Error(resT.message);
      setStudents(resT.students);
    }
    catch(err){
      console.error(err.message)
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  // שינוי שדות
  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(name, value);
    if (name === 'day' || name === 'hh') {
      setLesson((prev) => ({
        ...prev,
        date: { ...prev.date, [name]: Number(value) },
      }));
      return;
    }

    setLesson((prev) => ({ ...prev, [name]: value }));
  };

    const validateBeforeSave = async(name = null, value = null) => {
        if(!name) {
          // ולידציה בסיסית
          if (!lesson.name?.trim()) return 'اسم الدرس مطلوب';
          const d = Number(lesson.date.day) ;
          const start = Number(lesson.date.startMin);
          const end = Number(lesson.date.endMin);
          console.log("day,start,end", d, start, end);
          if (Number.isNaN(d) || d < 1 || d > 7) return 'يوم غير صالح';
          if (Number.isNaN(start) || start < 0 || start > 23 * 60) return 'ساعة بدء غير صالحة';
          if (Number.isNaN(end) || end < start || end > 23 * 60) return 'ساعة انتهاء غير صالحة';

        return null;
      }
      else{
        const tag = document.getElementsByName(name)[0];
        if(name === "name" && isNew && value === ""){
          tag?.style.setProperty('border', '2px solid red'); // או ישירות סטייל
          return "املاء الخانة";
        } else if(name === "name" && isNew) {
          return "";
        }
    }
  };
  

  // שמירה
  const handleSave = async () => {
    let b = await validateBeforeSave();
    if (b) { toast.warn(b); return; }
    for(const tag in [{'name': lesson.name} ,{'date.day': lesson.date.day},{'date.startMin': lesson.date.startMin}, {'date.endMin': lesson.date.endMin}]) {
      validateBeforeSave(tag.key, tag.value);
    }
    try {
      const resL =
        id === 'new'
          ? await createLesson(lesson)
          : await updateLesson(id,lesson);
      
      if (!resL) return;
      if (resL.ok) {
        console.log(`✅ الدرس ${id === 'new'? 'נשמר' : 'עודכן' }  بنجاح`, resL);
        toast.success(`✅ الدرس ${id === 'new'? 'حفظ' : 'حديث' }  بنجاح`);
        navigate(-1);
      } else {
        // alert(resL.message || '❌ שגיאה בשמירה');
        // console.warn(resL.message || '❌ שגיאה בשמירה');
        toast.warn(resL.message || '❌ שגיאה בשמירה');
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || '❌ שגיאה בשמירה');
    }
  };

  // מחיקה
  const handleDelete = async () => {
    if (id === 'new') return;

    try {
      const resDL = await deleteLesson(id);
      if(!resDL) return;
      if("delete b", resDL);
      if (resDL.ok) {
        toast.success('✅ השיעור נמחק');
        navigate(-1);
      } else {
        toast.warn('❌ השיעור לא נמחק');
      }
    } catch {
      toast.error('❌ שגיאה במחיקה');
    }
  };

  const filteredSelected = students
    .filter((u) => lesson.list_students.includes(u._id))
    .filter((u) => (u.firstname + u.lastname + u.tz).toLowerCase().includes(searchTerm.toLowerCase()));

  const modalChoices = students.filter((u) =>
    (u.firstname + ' ' + u.lastname + u.tz).toLowerCase().includes(searchTerm2.toLowerCase())
  );

  return (
    <div className={styles.editLessonContainer}>
      {
      localStorage.getItem('roles').includes('ادارة') ? (
        <h2>{id === 'new' ? '➕ اضافة كرس' : '✏️ تعديل كرس'}</h2>
      ) : (
        <h2>معلومات الكرس</h2>
      )}

      <div className={styles.formControl}>
        <label>اسم الدرس:</label>
        <input
          type="text"
          name="name"
          value={lesson.name}
          onChange={handleChange}
          placeholder="הכנס שם שיעור"
          disabled={!localStorage.getItem('roles').includes('ادارة')}
        />
        
        <label style={{color: "red"}}>{error.name}</label>
      </div>

      {teachers.length > 0 && <div className={styles.formControl}>
        <label>مرشد:</label>
        <select
          name="teacher"
          value={lesson.teacher}
          onChange={handleChange}
          disabled={!localStorage.getItem('roles').includes('ادارة')}
        >
          <option value="">اختار مرشد</option>
          {Array.isArray(teachers) &&
            teachers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.firstname} {t.lastname}
              </option>
            ))}
        </select>
        <label style={{color: "red"}}>{error.teacher}</label>
      </div> }
        
      {helpers.length > 0 && <div className={styles.formControl}>
        <label>مساعد:</label>
        <select
          name="helper"
          value={lesson.helper}
          onChange={handleChange}
          disabled={!localStorage.getItem('roles').includes('ادارة')}
        >
          <option value="">اختار مساعد</option>
          {Array.isArray(helpers) &&
            helpers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.firstname} {t.lastname}
              </option>
            ))}
        </select>
        <label style={{color: "red"}}>{error.helper}</label>
      </div> }

      <div className={styles.formControl}>
        <label>اختر يوم للدرس:</label>
        <select
          name="day"
          value={lesson.date.day}
          onChange={handleChange}
          disabled={!localStorage.getItem('roles').includes('ادارة')}
        >
          {['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس','الجمعة','السبت'].map((d, i) => (
            <option value={i+1} key={i+1}>
              {d}
            </option>
          ))}
        </select>
        <label style={{color: "red"}}>{error.date.day}</label>
      </div>


      <div className={styles.formControl}>
        <label>اختر غرفة للدرس:</label>
        <select
          name="room"
          value={lesson.room}
          onChange={handleChange}
          disabled={!localStorage.getItem('roles').includes('ادارة')}
        >
          <option value="">اختار غرفة</option>
          {Array.from({length: 6}, (_, i)=>i+1).map((d, i) => (
            <option value={i+1} key={i+1}>
              {d}
            </option>
          ))}
        </select>
        <label style={{color: "red"}}>{error.date.day}</label>
      </div>

      <div className={styles.formControl}>
        <label>ساعة البدء:</label>
        <input
          type="time"
          value={toHHMM(lesson.date.startMin)}
          onChange={(e) => handleTimeChange('start', e.target.value)}
          disabled={!localStorage.getItem('roles').includes('ادارة')}
        />
      </div>
      <div className={styles.formControl}>
        <label>ساعة الانتهاء:</label>
        <input
          type="time"
          value={toHHMM(lesson.date.endMin)}
          onChange={(e) => handleTimeChange('end', e.target.value)}
          disabled={!localStorage.getItem('roles').includes('ادارة')}
        />
      </div>

      <h4> التلاميذ المتواجدون في الدرس: {lesson.list_students?.length || 0}</h4>

      {localStorage.getItem('roles').includes('ادارة') && (
        <>
          <input
            type="text"
            placeholder="חפש מתאמן לפי שם או תעודת זהות"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <button
            style={{ backgroundColor: 'green', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
            onClick={() => setShowTraineeModal(true)}
          >
            ➕ اضافة تلميذ
          </button>

          <table className={styles.selectedTraineesTable}>
            <thead>
              <tr>
                <th>ת.ז.</th>
                <th>שם פרטי</th>
                <th>שם משפחה</th>
              </tr>
            </thead>
            <tbody>
              {filteredSelected.map((u) => (
                <tr key={u._id}>
                  <td>{u.tz}</td>
                  <td>{u.firstname}</td>
                  <td>{u.lastname}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.buttonRow}>
            <button type="button" onClick={handleSave}>
              {id !== 'new' ? 'שמור שינויים' : 'צור שיעור'}
            </button>
            {id !== 'new' && (
              <button type="button" style={{ background: 'red' }} onClick={handleDelete}>
                מחיקת שיעור
              </button>
            )}
            <button type="button" style={{ background: "#6b7280" }} onClick={() => navigate(-1)}>
          חזרה לרשימה
        </button>
          </div>
        </>
      )}

      {showTraineeModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h4>הוספת מתאמנים</h4>
            <input
              type="text"
              placeholder="חיפוש לפי שם או תז"
              value={searchTerm2}
              onChange={(e) => setSearchTerm2(e.target.value)}
            />

            <div className={styles.traineesList}>
              {modalChoices.map((trainee) => {
                const alreadyInList = lesson.list_students.includes(trainee._id);
                return (
                  <label key={trainee._id} className={styles.traineeItem}>
                    <input
                      type="checkbox"
                      checked={alreadyInList}
                      onChange={(e) => {
                        const { checked } = e.target;
                        if (checked && lesson.list_students.length === Number(lesson.max_trainees)) {
                          return toast.warn('הגענו למקסימום משתתפים לשיעור הזה');
                        }
                        setLesson((prev) => ({
                          ...prev,
                          list_students: checked
                            ? [...prev.list_students, trainee._id]
                            : prev.list_students.filter((tid) => tid !== trainee._id),
                        }));
                      }}
                    />
                    {trainee.firstname} {trainee.lastname} ({trainee.tz})
                  </label>
                );
              })}
            </div>

            <button onClick={() => setShowTraineeModal(false)}>✔️ סגור</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditLesson;
