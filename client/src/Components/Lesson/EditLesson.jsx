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
import { isStoredAdmin } from '../../utils/session';
import Button from '../UI/Button';
const EditLesson = () => {
  const isAdmin = isStoredAdmin();

  const { id } = useParams(); // ملاحظة عربية
  
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const dayFromUrl = Number(searchParams.get('day'))+1 || 1;
  const hhFromUrl = (Number(searchParams.get('startMin'))/60) || 8;

  const [lesson, setLesson] = useState({
    name: '',
    date: { 
      day: dayFromUrl,     
      startMin: hhFromUrl*60,           // ملاحظة عربية
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

  // ملاحظة عربية
  const toMin = (hhmm) => {
    const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
    return (hh*60 + (mm||0))|0;
  };
  const toHHMM = (min) => {
    const h = Math.floor(min/60);
    const m = min%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };

  // handleChange عربيالسبتالأربعاءالجمعةعربي ساعات
  const handleTimeChange = (name, hhmm) => {
    setLesson(prev => {
      let startMin = prev.date.startMin;
      let endMin   = prev.date.endMin;
      if (name === 'start') {
        startMin = toMin(hhmm);
        if (endMin <= startMin) endMin = startMin + 45
      } else {
        endMin = toMin(hhmm);
        if (endMin <= startMin + 45) endMin = startMin + 45; // ملاحظة عربية
      }
      return { ...prev, date: { ...prev.date, startMin, endMin } };
    });
  };
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [helpers, setHelpers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTerm2, setSearchTerm2] = useState('');
  const [showTraineeModal, setShowTraineeModal] = useState(false);

  // ملاحظة عربية
  useEffect(() => {
    if (id === 'new') {
      setLesson((prev) => ({
        ...prev,
        date: { ...prev.date, day: dayFromUrl, startMin: hhFromUrl*60, endMin:   hhFromUrl*60 + 45 },
      }));
    }
  }, [id, dayFromUrl, hhFromUrl]);

  // ملاحظة عربية
  const loadData = async () => {
    try {
      const usersRes = await getAllU();
      if (usersRes?.ok) {
        const allUsers = usersRes.users || [];
        setTeachers(allUsers.filter((u) => u.roles.includes('مرشد')));
        setHelpers(allUsers.filter((u) => u.roles.includes('مساعد')));
      } else{
        throw new Error(usersRes?.message)
      }
    }
    catch(err){
      console.error(err.message)
    }
    try{
      if (id !== 'new') {
        const resL = await getOneLesson(id);
        if(!resL.ok) throw new Error(resL.message);
        const l = resL.lesson;
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

  // ملاحظة عربية
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'day' || name === 'hh') {
      setLesson((prev) => ({
        ...prev,
        date: { ...prev.date, [name]: Number(value) },
      }));
      return;
    }

    setLesson((prev) => ({ ...prev, [name]: value }));
  };

    const validateBeforeSave = async() => {
      if (!lesson.name?.trim()) return 'اسم الدرس مطلوب';
      const d = Number(lesson.date.day);
      const start = Number(lesson.date.startMin);
      const end = Number(lesson.date.endMin);
      if (Number.isNaN(d) || d < 1 || d > 7) return 'يوم غير صالح';
      if (Number.isNaN(start) || start < 0 || start > 23 * 60) return 'ساعة بدء غير صالحة';
      if (Number.isNaN(end) || end < start || end > 23 * 60) return 'ساعة انتهاء غير صالحة';

      return null;
    };

  const handleSave = async () => {
    const validationError = await validateBeforeSave();
    if (validationError) { toast.warn(validationError); return; }
    try {
      const resL =
        id === 'new'
          ? await createLesson(lesson)
          : await updateLesson(id,lesson);

      if (!resL) return;
      if (resL.ok) {
        toast.success(`✅ الدرس ${id === 'new'? 'حفظ' : 'حديث' }  بنجاح`);
        navigate(-1);
      } else {
        toast.warn(resL.message || '❌ خطأ في الحفظ');
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || '❌ خطأ في الحفظ');
    }
  };

  // حذف
  const handleDelete = async () => {
    if (id === 'new') return;

    try {
      const resDL = await deleteLesson(id);
      if(!resDL) return;
      if (resDL.ok) {
        toast.success('✅ تم حذف الدرس');
        navigate(-1);
      } else {
        toast.warn('❌ لم يتم حذف الدرس');
      }
    } catch {
      toast.error('❌ خطأ في الحذف');
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
      isAdmin ? (
      <center><h1>{id != "new" ? "تحديث بيانات الدرس" : "اضافة درس جديد"}</h1></center>
      ) : (
        <h2>معلومات الكرس</h2>
      )}

      <div className={styles.formControl}>
        <label>اسم الدرس:<span style={{color: "red"}}>*</span></label>
        <input
          type="text"
          name="name"
          value={lesson.name}
          onChange={handleChange}
          placeholder="أدخل اسم الدرس"
          disabled={!isAdmin}
        />
        
        <label style={{color: "red"}}>{error.name}</label>
      </div>

      <div className={styles.formControl}>
        <label>مرشد:<span style={{color: "red"}}>*</span></label>
        <select
          name="teacher"
          value={lesson.teacher}
          onChange={handleChange}
          disabled={!isAdmin}
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
      </div>
        
      <div className={styles.formControl}>
        <label>مساعد:</label>
        <select
          name="helper"
          value={lesson.helper}
          onChange={handleChange}
          disabled={!isAdmin}
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
      </div>

      <div className={styles.formControl}>
        <label>اختر يوم للدرس:<span style={{color: "red"}}>*</span></label>
        <select
          name="day"
          value={lesson.date.day}
          onChange={handleChange}
          disabled={!isAdmin}
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
        <label>اختر غرفة للدرس:<span style={{color: "red"}}>*</span></label>
        <select
          name="room"
          value={lesson.room}
          onChange={handleChange}
          disabled={!isAdmin}
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
        <label>ساعة البدء:<span style={{color: "red"}}>*</span></label>
        <input
          type="time"
          value={toHHMM(lesson.date.startMin)}
          onChange={(e) => handleTimeChange('start', e.target.value)}
          disabled={!isAdmin}
        />
      </div>
      <div className={styles.formControl}>
        <label>ساعة الانتهاء:<span style={{color: "red"}}>*</span></label>
        <input
          type="time"
          value={toHHMM(lesson.date.endMin)}
          onChange={(e) => handleTimeChange('end', e.target.value)}
          disabled={!isAdmin}
        />
      </div>

      <h4> التلاميذ المتواجدون في الدرس: {lesson.list_students?.length || 0}</h4>

      {isAdmin && (
        <>
          <input
            type="text"
            placeholder="ابحث عن متدرب حسب الاسم أو رقم الهوية"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <Button onClick={() => setShowTraineeModal(true)}>
            + اضافة تلميذ
          </Button>

          <table className={styles.selectedTraineesTable}>
            <thead>
              <tr>
                <th>رقم الهوية</th>
                <th>اسم</th>
                <th>العائلة</th>
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

          <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
            <Button type="button" onClick={handleSave}>
              {id !== 'new' ? 'تعديل البيانات' : 'حفظ البيانات'}
            </Button>
            {id !== 'new' && (
              <Button type="button" variant="danger" onClick={handleDelete}>
              حذف
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>الرجوع للقائمة</Button>
          </div>
        </>
      )}

      {showTraineeModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h4>إضافة متدربين</h4>
            <input
              type="text"
              placeholder="بحث حسب الاسم أو رقم الهوية"
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
                          return toast.warn('وصلنا إلى الحد الأقصى للمشاركين في هذا الدرس');
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

            <button onClick={() => setShowTraineeModal(false)}>✔️ إغلاق</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditLesson;
