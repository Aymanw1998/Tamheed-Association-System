import React, { useEffect, useMemo, useState, useRef } from 'react';
import styles from './ViewAllLesson.module.css';
import { getUserById } from '../../WebServer/services/user/functionsUser';
import { copyLessonsMonth, deleteLessonsPerMonth, getAllLesson, updateLesson } from '../../WebServer/services/lesson/functionsLesson';
import { useNavigate } from 'react-router-dom';
import Fabtn from "./../Global/Fabtn/Fabtn";
import { toast } from '../../ALERT/SystemToasts';

/* === helpers === */
const BASE_MIN = 8 * 60;   // 08:00
const END_MIN  = 23 * 60;  // 22:00
const dayNames = ['الاحد','الاثنين','الثلاثاء','الأربعاء','الخميس', 'الجمعة', 'السبت']; // 1=א׳ .. 5=ה׳

const toHHMM = (min) => {
  const m = Math.max(0, Math.min(min ?? 0, 24*60));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
};
const minuteToPx = (min) => Math.max(0, Math.min((min ?? BASE_MIN) - BASE_MIN, END_MIN - BASE_MIN));
const getStart = (l) => l?.date?.startMin ?? ((l?.date?.hh ?? 8) * 60);
const getEnd   = (l) => l?.date?.endMin   ?? (getStart(l) + 45);

/* === דסקטופ: לוח 5 ימים עם כותרות === */
function DesktopTimeline({ lessons, canEdit, currentMonth, currentYear, showMyLessons, navigate, onReload, onHover }) {
  // קיבוץ לימים (א׳–ה׳)
  const byDay = useMemo(() => {
    const map = {1:[],2:[],3:[],4:[],5:[], 6:[], 7:[]}; // 1=א׳ .. 5=ה׳ (+6 לשמור מקום)
    const uid = localStorage.getItem('user_id');

    for (const l of (lessons || [])) {
      if (!l?.date) continue;
      let day     = Number(l.date.day);

      if (!(day >= 1 && day <= 7)) continue;

      const isMine = String(l.teacher) === String(uid) || (l.list_students || []).map(String).includes(String(uid));
      console.log("showMyLessons check", day, showMyLessons, isMine);
      if (!showMyLessons || localStorage.getItem('roles').includes('ادارة') || (showMyLessons && isMine)) map[day].push(l);
    }
    console.log("byDay map", map);
    return map;
  }, [lessons, currentMonth, currentYear, showMyLessons]);

  const hourMarks = Array.from({length: 16}, (_, i) => 8 + i); // 08..22

  const rescheduleLesson = async (lesson, day, targetStartMin) => {
    console.log("reschedule", lesson, day, targetStartMin);
    const dur = Math.max(1, getEnd(lesson) - getStart(lesson));
    const newStart = Math.max(BASE_MIN, Math.min(targetStartMin, END_MIN - 1));
    const newEnd   = Math.min(newStart + dur, 24*60);

    try {
      const res = await updateLesson(
        lesson._id,
        {name: lesson.name,
        date: { day, startMin: newStart, endMin: newEnd },
        teacher: lesson.teacher,
        list_students: lesson.list_students}
      );
      if (res?.status === 200 || res?.ok) {
        toast.success('עודכן בהצלחה');
        onReload?.();
      } else {
        toast.error(res?.message || 'שגיאה בעדכון');
      }
    } catch {
      toast.error('שגיאה בעדכון');
    }
  };

  return (
    <>
      {/* שורת כותרות */}
      <div className={styles.timelineGrid}>
        <div className={styles.headerSpacer} />
        {dayNames.map((dn, i) => (
          <div key={i} className={styles.dayHeader}>{dn}</div>
        ))}

        {/* עמודת תוויות שעות */}
        <div className={styles.hoursGutter}>
          {hourMarks.map(h => (
            <div key={h}>
              <div className={styles.hourLine} style={{ top: `${(20+h*60 - BASE_MIN)}px` }} />
              <div className={styles.hourLabel} style={{ top: `${(20+h*60 - BASE_MIN)}px` }}>
                {String(h).padStart(2,'0')}:00
              </div>
            </div>
          ))}
        </div>

        {/* חמשת הימים */}
        {dayNames.map((_dn, idx) => {
          const day = idx ;
          return (
            <div
              key={day}
              className={styles.dayCol}
              onClick={(e) => {
                if (!canEdit) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                const clickedMin = BASE_MIN + Math.round(offsetY);
                navigate(`/lessons/new?day=${day}&startMin=${clickedMin}`);
              }}
              onDragOver={(e) => { if (canEdit) e.preventDefault(); }}
              onDrop={(e) => {
                if (!canEdit) return;
                const lessonId = e.dataTransfer.getData('lesson-id');
                if (!lessonId) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                const targetStartMin = BASE_MIN + Math.round(offsetY);

                const all = Object.values(byDay).flat();
                const l   = all.find(x => String(x._id) === String(lessonId));
                if (!l) return;

                rescheduleLesson(l, day, targetStartMin);
              }}
            >
              {(byDay[day+1] || []).map(l => {
                const top    = 30 + minuteToPx(getStart(l));
                const height = Math.max(10, getEnd(l) - getStart(l));
                return (
                  <div
                    key={l._id}
                    className={styles.lessonBlock}
                    style={{ top, height }}
                    draggable={canEdit}
                    onClick={(ev) => { ev.stopPropagation(); navigate(`/lessons/${l._id}`); }}
                    onDragStart={(e) => e.dataTransfer.setData('lesson-id', l._id)}
                    onMouseEnter={() => onHover?.(l, `${toHHMM(getStart(l))}–${toHHMM(getEnd(l))}`, dayNames[day])}
                    onMouseMove={(e) => onHover?.('__move__', e.clientX, e.clientY)}
                    onMouseLeave={() => onHover?.()}
                  >
                    <div><b>{l.name}</b></div>
                    <div>{toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* === מובייל + מעטפת === */
function ScheduleView({ room, lessons, canEdit, currentMonth, currentYear, showMyLessons, navigate, onReload, setTooltip }) {
  const [teacherNames, setTeacherNames] = useState({});
  useEffect(()=>console.log("ScheduleView", room, lessons))
  useEffect(() => {
    // טעינת שמות מאמנים (אופציונלי)
    const load = async () => {
      const ids = Array.from(new Set((lessons || []).map(l => l?.teacher).filter(Boolean).map(String)));
      const pairs = await Promise.all(ids.map(async id => {
        try {
          const res = await getUserById(id);
          if (!res?.ok) throw 0;
          const u = res.user || {};
          return [id, [u.firstname, u.lastname].filter(Boolean).join(' ') || 'לא ידוע'];
        } catch { return [id, 'שגיאה']; }
      }));
      setTeacherNames(Object.fromEntries(pairs));
    };
    load();
  }, [lessons]);

  const filtered = useMemo(() => {
    console.log("filtering lessons", {lessons, showMyLessons});
    const uid = localStorage.getItem('user_id');
    return (lessons || [])
      // .filter(l => l?.date?.month === currentMonth && l?.date?.year === currentYear)
      .filter(l => {
        if (!showMyLessons || localStorage.getItem("roles").includes('ادارة')) return true;
        console.log("check lesson", l, uid);
        const isMine = String(l.teacher) === String(uid) || (l.list_students || []).map(String).includes(String(uid));
        return isMine;
      })
      .sort((a,b) => (a.date.day - b.date.day) || (getStart(a) - getStart(b)));
  }, [lessons, currentMonth, currentYear, showMyLessons]);

  return (
    <div className={styles.scheduleContainer}>
      <h1>قائمة الدروس للغرفة {room}</h1>
      {/* מובייל */}
      <div className={styles.mobileView}>
        { (
          <button id="page-add-lesson" className={styles.addBtn}
                  style={{backgroundColor: "greenyellow"}}
                  onClick={() => navigate(`/lessons/new?month=${currentMonth}&year=${currentYear}&room=${room}`)}>
                    {"اضافة درس للاسبوع"}
          </button>
        )}

        {filtered.map(l => (
          <div key={l._id} className={styles.lessonCard}
               onClick={() => navigate(`/lessons/${l._id}`)}
               onMouseEnter={() => setTooltip?.({ show:true, content:(
                 <>
                   <div style={{display:'flex',gap:4}}><span>🧑‍🏫</span><span>اسم:</span><span>{l.name}</span></div>
                   <div style={{display:'flex',gap:4}}><span>🕒</span><span>ساعة:</span><span>{toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</span></div>
                   <div style={{display:'flex',gap:4}}><span>📅</span><span>يوم:</span><span>{dayNames[(l.date.day)-1]}</span></div>
                    <div style={{display:'flex',gap:4}}><span>📅</span><span>غرفة:</span><span>{(l?.room || "لا يوجد")}</span></div>
                 </>
               )})}
               onMouseLeave={() => setTooltip?.({ show:false })}
          >
<div style={{display:'flex',gap:4}}><span>🧑‍🏫</span><span>اسم:</span><span>{l.name}</span></div>
                   <div style={{display:'flex',gap:4}}><span>🕒</span><span>ساعة:</span><span>{toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</span></div>
                   <div style={{display:'flex',gap:4}}><span>📅</span><span>يوم:</span><span>{dayNames[(l.date.day)-1]}</span></div>
                    <div style={{display:'flex',gap:4}}><span>📅</span><span>غرفة:</span><span>{(l?.room || "لا يوجد")}</span></div>            {/* <p><strong>מאמן:</strong> {teacherNames[l.teacher] || 'טוען...'}</p> */}
          </div>
        ))}
      </div>

      {/* דסקטופ */}
      <div className={styles.desktopView}>
        <DesktopTimeline
          lessons={lessons}
          canEdit={canEdit}
          currentMonth={currentMonth}
          currentYear={currentYear}
          showMyLessons={showMyLessons}
          navigate={navigate}
          onReload={onReload}
          onHover={(l, time, day) => {
            if (l === '__move__') return; // מטופל מלמעלה
            if (!l) return setTooltip({ show:false });
            setTooltip({
              show: true,
              content: (
                <>
                  <div style={{display:'flex',gap:4}}><span>🧑‍🏫</span><span>اسم:</span><span>{l.name}</span></div>
                  <div style={{display:'flex',gap:4}}><span>🕒</span><span>ساعة:</span><span>{toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</span></div>
                  <div style={{display:'flex',gap:4}}><span>📅</span><span>يوم:</span><span>{dayNames[(l.date.day)-1]}</span></div>
                  <div style={{display:'flex',gap:4}}><span>📅</span><span>غرفة:</span><span>{(l?.room || "لا يوجد")}</span></div>                </>
              )
            });
          }}
        />
      </div>
    </div>
  );
}

/* === עמוד הראשי === */
export default function ViewAllLesson() {
  const navigate = useNavigate();

  const topAnchorRef = useRef(null);
  const [showFab, setShowFab] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => setShowFab(!entry.isIntersecting), { root: null });
    if (topAnchorRef.current) io.observe(topAnchorRef.current);
    return () => io.disconnect();
  }, []);

  const [monthOffset, setMonthOffset] = useState(Number(localStorage.getItem("monthOffset")) || 0);
  const currentMonthInfo = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() + monthOffset);
    return { label: `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` };
  }, [monthOffset]);

  const [canEdit, setCanEdit] = useState(true);
  useEffect(() => { localStorage.setItem('canEdit', String(canEdit)); }, [canEdit]);

  const [isLoading, setIsLoading] = useState(false);
  const [lessons, setLessons] = useState([]);
  const [rooms, setRooms] = useState([]);
  const loadRooms = () => {
    const rms = (lessons || []).reduce((acc, curr) => {
      const roomKey = curr?.room ?? 0;
      (acc[roomKey] ??= []).push(curr); 
      return acc;
    }, {});
    const sorted = Object.fromEntries(
      Object.entries(rms).sort(([a], [b]) => Number(a) - Number(b))
    );

    setRooms(sorted);
  };
  useEffect(()=>console.log("rooms",rooms),[rooms])
  useEffect(() => console.log("lessons ", lessons), [lessons]);
  useEffect(()=>{lessons && lessons.length > 0 && loadRooms()},[lessons])
  const loadData = async () => {
    try {
      setIsLoading(true);
      const res = await getAllLesson();
      console.log("all lessons", res);
      if (!res?.ok) throw new Error(res?.message || 'Load failed');
      if (Array.isArray(res.lessons)) {
        const cleaned = res.lessons.map(lesson => ({
          ...lesson,
          list_students: Array.isArray(lesson.list_students)
            ? lesson.list_students.filter(t => t != null && t != undefined)
            : []
        }));
        setLessons(cleaned);
      } else {
        setLessons([]);
      }

    } catch (e) {
      toast.error('שגיאה בטעינת השיעורים');
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => { loadData(); }, [monthOffset]);

  const [tooltipInfo, setTooltipInfo] = useState({ show:false, content:'', x:0, y:0 });
  const onMouseMove = (e) => setTooltipInfo(prev => ({ ...prev, x: e.clientX, y: e.clientY }));

  const [showMyLessons, setShowMyLessons] = useState(localStorage.getItem("roles").includes("ادارة"));

  return (
    <div>
      <span ref={topAnchorRef} className={styles.fabAnchor} aria-hidden="true" />
      <h1 className={styles.title}>برنامج الدروس</h1>

      
      {isLoading ? (
        <div className={styles.loaderWrap}>
          <div />{/* spacer */}
          {[...Array(7)].map((_,i)=><div key={i} className={styles.loaderBox} />)}
        </div>
      ) : (
        Object.entries(rooms).map(([roomId, roomLessons]) => {
          return <ScheduleView
          room={roomId}
          lessons={roomLessons}
          canEdit={canEdit}
          currentMonth={currentMonthInfo.month}
          currentYear={currentMonthInfo.year}
          showMyLessons={showMyLessons}
          navigate={navigate}
          onReload={loadData}
          setTooltip={(t)=> setTooltipInfo(prev => ({ ...prev, ...t }))}
        />
        })
      )}

      {tooltipInfo.show && (
        <div
          style={{
            top: tooltipInfo.y, left: tooltipInfo.x,
            position: 'absolute', background: 'black', color: 'white',
            padding: 10, border: '1px solid black', borderRadius: 5,
            pointerEvents: 'none', zIndex: 9999,
          }}
          onMouseMove={onMouseMove}
        >
          {tooltipInfo.content}
        </div>
      )}

      <Fabtn
        anchor="#page-add-lesson"
        visible={showFab}
        label="הוספת שיעור"
        onClick={() => navigate(`/lessons/new?month=${currentMonthInfo.month}&year=${currentMonthInfo.year}`)}
      />
    </div>
  );
}
