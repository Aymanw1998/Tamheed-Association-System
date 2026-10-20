import React, { useEffect, useMemo, useState } from 'react';
import { useUnsavedChanges } from '../../utils/unsavedChanges';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getOneLesson,
  createLesson,
  updateLesson,
  getAllLesson,
  deleteLesson,
  addToList,
} from '../../WebServer/services/lesson/functionsLesson';
import styles from './EditLesson.module.css';
import { toast } from '../../ALERT/SystemToasts';

import { getAll as getAllS} from '../../WebServer/services/student/functionsStudent';
import { getAll as getAllU } from '../../WebServer/services/user/functionsUser';
import { canStored, normalizeRoles, ADMIN_ROLES, getStoredUserId } from '../../utils/session';
import { buildAddPayload, countAdded, unwrapCreated } from '../../utils/lessonRoster';
import { useI18n } from '../../i18n/I18nContext';
import { ROOM_OPTIONS } from '../../utils/rooms';
import sectionStyles from '../UI/FormSection.module.css';
import LessonRoster from './LessonRoster';
import Button from '../UI/Button';
const EditLesson = () => {
  const { id } = useParams(); // ملاحظة عربية
  const { t } = useI18n();
  // A guide (no students.viewAll) must be on the lessons he creates.
  const viewAll = canStored('students.viewAll');
  const myId = getStoredUserId();
  // Students found by ID number on a lesson that is not saved yet.
  const [pendingLooked, setPendingLooked] = useState([]);
  const isAdmin = canStored(id === "new" ? "lessons.create" : "lessons.edit");
  const canDelete = canStored("lessons.delete");
  
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const dayFromUrl = Number(searchParams.get('day')) || 1;
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
  const [allLessons, setAllLessons] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Counts the server sends for display are not edits.
  const editable = useMemo(() => {
    const { hiddenCount, num_in_list, ...rest } = lesson;
    return rest;
  }, [lesson]);
  useUnsavedChanges(editable, loaded);

  // ملاحظة عربية
  useEffect(() => {
    if (id === 'new') {
      setLesson((prev) => ({
        ...prev,
        date: { ...prev.date, day: dayFromUrl, startMin: hhFromUrl*60, endMin:   hhFromUrl*60 + 45 },
        teacher: prev.teacher || (!viewAll ? myId : ''),
      }));
    }
  }, [id, dayFromUrl, hhFromUrl, viewAll, myId]);

  // ملاحظة عربية
  const loadData = async () => {
    try {
      const usersRes = await getAllU();
      if (usersRes?.ok) {
        const allUsers = usersRes.users || [];
        // Administrators run lessons too, so they belong in the same picker.
        // The system account is never in the list (the server leaves it out).
        setTeachers(allUsers.filter((u) => {
          const roles = normalizeRoles(u.roles);
          return roles.includes('مرشد') || roles.some((r) => ADMIN_ROLES.includes(r));
        }));
        setHelpers(allUsers.filter((u) => normalizeRoles(u.roles).includes('مساعد')));
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
      const resAll = await getAllLesson();
      if (resAll?.ok) setAllLessons(resAll.lessons || []);
    }
    catch(err){
      console.error(err.message)
    }
  };

  useEffect(() => {
    setLoaded(false);
    loadData().finally(() => setLoaded(true));
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
      if (!lesson.teacher) return 'المرشد مطلوب';
      if (!lesson.room || lesson.room === '-1') return 'المكان مطلوب';
      const d = Number(lesson.date.day);
      const start = Number(lesson.date.startMin);
      const end = Number(lesson.date.endMin);
      if (Number.isNaN(d) || d < 1 || d > 7) return 'يوم غير صالح';
      if (Number.isNaN(start) || start < 0 || start > 23 * 60) return 'ساعة بدء غير صالحة';
      if (Number.isNaN(end) || end < start || end > 23 * 60) return 'ساعة انتهاء غير صالحة';

      return null;
    };

  // Adds a student found by full ID number to a saved lesson. The server
  // answers ok even if it dropped the entry, so the lesson is read again
  // before and after to see whether the student really joined.
  const addFoundStudent = async (student) => {
    if (id === 'new') {
      setPendingLooked((prev) => [...prev, student]);
      return true;
    }
    const before = await getOneLesson(id);
    const res = await addToList(id, buildAddPayload({ looked: [student] }));
    if (!res.ok) return false;
    const after = await getOneLesson(id);
    if (!before.ok || !after.ok) return false;
    const had = new Set(before.lesson.list_students.map(String));
    const fresh = after.lesson.list_students.map(String).filter((x) => !had.has(x));
    setLesson((prev) => ({
      ...prev,
      list_students: [...prev.list_students, ...fresh.filter((x) => !prev.list_students.map(String).includes(x))],
      hiddenCount: after.lesson.hiddenCount,
      num_in_list: after.lesson.num_in_list,
    }));
    const resS = await getAllS();
    if (resS.ok) setStudents(resS.students);
    return countAdded(before.lesson, after.lesson) > 0;
  };

  const handleSave = async () => {
    const validationError = await validateBeforeSave();
    if (validationError) { toast.warn(validationError); return; }
    try {
      // Display-only fields from the server are never sent back.
      const { hiddenCount, num_in_list, ...body } = lesson;
      const resL =
        id === 'new'
          ? await createLesson({ ...body, ...buildAddPayload({ ids: lesson.list_students, looked: pendingLooked }) })
          : await updateLesson(id, body);

      if (!resL) return;
      if (resL.ok) {
        if (id === 'new') {
          const expected = lesson.list_students.length + pendingLooked.length;
          // The create answer is unscoped and wrapped; re-read the lesson as this viewer sees it.
          const createdId = unwrapCreated(resL.lesson)?._id;
          const fresh = createdId ? await getOneLesson(createdId) : null;
          if (!fresh?.ok || countAdded({ num_in_list: 0 }, fresh.lesson) < expected) toast.warn(t('roster.someNotAdded'));
        }
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

  return (
    <div className={styles.editLessonContainer}>
      {
      isAdmin ? (
      <center><h1>{id != "new" ? "تحديث بيانات الدرس" : "اضافة درس جديد"}</h1></center>
      ) : (
        <h2>معلومات الكرس</h2>
      )}

      <fieldset className={sectionStyles.formSection}>
        <legend>بيانات الدرس</legend>
        <div className={styles.formControl}>
          <label htmlFor="lesson-name">اسم الدرس:<span style={{color: "red"}}>*</span></label>
          <input
            type="text"
            name="name"
            id="lesson-name"
            value={lesson.name}
            onChange={handleChange}
            placeholder="أدخل اسم الدرس"
            disabled={!isAdmin}
          />
          <label style={{color: "red"}}>{error.name}</label>
        </div>
      </fieldset>

      <fieldset className={sectionStyles.formSection}>
        <legend>الموعد والمكان</legend>
        <div className={styles.formControl}>
          <label htmlFor="lesson-day">اختر يوم للدرس:<span style={{color: "red"}}>*</span></label>
          <select
            name="day"
            id="lesson-day"
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

        <div className={styles.timeRow}>
          <div className={styles.formControl}>
            <label htmlFor="lesson-start">ساعة البدء:<span style={{color: "red"}}>*</span></label>
            <input
              type="time"
              value={toHHMM(lesson.date.startMin)}
            id="lesson-start"
              onChange={(e) => handleTimeChange('start', e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className={styles.formControl}>
            <label htmlFor="lesson-end">ساعة الانتهاء:<span style={{color: "red"}}>*</span></label>
            <input
              type="time"
              value={toHHMM(lesson.date.endMin)}
            id="lesson-end"
              onChange={(e) => handleTimeChange('end', e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </div>

        <div className={styles.formControl}>
          <label htmlFor="lesson-room">المكان:<span style={{color: "red"}}>*</span></label>
          <select
            name="room"
            id="lesson-room"
            value={lesson.room}
            onChange={handleChange}
            disabled={!isAdmin}
          >
            <option value="">اختار مكان</option>
            {ROOM_OPTIONS.map(({ value, label }) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <label style={{color: "red"}}>{error.room}</label>
        </div>
      </fieldset>

      <fieldset className={sectionStyles.formSection}>
        <legend>الطاقم</legend>
        <div className={styles.formControl}>
          <label htmlFor="lesson-teacher">مرشد:<span style={{color: "red"}}>*</span></label>
          {id === 'new' && !viewAll && <small>{t('roster.teacherHint')}</small>}
          <select
            name="teacher"
            id="lesson-teacher"
            value={lesson.teacher}
            onChange={handleChange}
            disabled={!isAdmin}
          >
            <option value="">اختار مرشد</option>
            {myId && !viewAll && !teachers.some((u) => String(u._id) === myId) && (
              <option value={myId}>{t('common.you')}</option>
            )}
            {Array.isArray(teachers) &&
              teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.firstname} {t.lastname}{t.tz ? ` (${String(t.tz).slice(-4)})` : ''}
                </option>
              ))}
          </select>
          <label style={{color: "red"}}>{error.teacher}</label>
        </div>

        <div className={styles.formControl}>
          <label htmlFor="lesson-helper">مساعد:</label>
          <select
            name="helper"
            id="lesson-helper"
            value={lesson.helper}
            onChange={handleChange}
            disabled={!isAdmin}
          >
            <option value="">اختار مساعد</option>
            {Array.isArray(helpers) &&
              helpers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.firstname} {t.lastname}{t.tz ? ` (${String(t.tz).slice(-4)})` : ''}
                </option>
              ))}
          </select>
          <label style={{color: "red"}}>{error.helper}</label>
        </div>
      </fieldset>

      <fieldset className={sectionStyles.formSection}>
        <legend>الطلاب في الدرس ({(lesson.list_students?.length || 0) + (Number(lesson.hiddenCount) || 0) + pendingLooked.length})</legend>
        <LessonRoster
          lesson={lesson}
          students={students}
          allLessons={allLessons}
          canEdit={isAdmin}
          hiddenCount={lesson.hiddenCount}
          pending={pendingLooked}
          onLookupAdd={isAdmin ? addFoundStudent : undefined}
          onRemovePending={(student) => setPendingLooked((prev) => prev.filter((x) => x._id !== student._id))}
          onChange={(ids) => setLesson((prev) => ({ ...prev, list_students: ids }))}
        />
      </fieldset>

      {isAdmin && (
        <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
          <Button type="button" onClick={handleSave}>
            {id !== 'new' ? 'تعديل البيانات' : 'حفظ البيانات'}
          </Button>
          {id !== 'new' && canDelete && (
            <Button type="button" variant="danger" onClick={handleDelete}>
            حذف
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>الرجوع للقائمة</Button>
        </div>
      )}
    </div>
  );
};

export default EditLesson;
