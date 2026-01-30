import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./ViewAllLesson.module.css";
import { getUserById, getAll as getAllUsers } from "../../WebServer/services/user/functionsUser";
import { getAllLesson, updateLesson } from "../../WebServer/services/lesson/functionsLesson";
import { useNavigate } from "react-router-dom";
import Fabtn from "./../Global/Fabtn/Fabtn";
import { toast } from "../../ALERT/SystemToasts";

/* =======================
   Helpers
======================= */
const BASE_MIN = 8 * 60;   // 08:00
const END_MIN  = 23 * 60;  // 23:00
const dayNames = ["الاحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"]; // 1..7

const toHHMM = (min) => {
  const m = Math.max(0, Math.min(min ?? 0, 24 * 60));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const minuteToPx = (min) =>
  Math.max(0, Math.min((min ?? BASE_MIN) - BASE_MIN, END_MIN - BASE_MIN));

const getStart = (l) => l?.date?.startMin ?? ((l?.date?.hh ?? 8) * 60);
const getEnd   = (l) => l?.date?.endMin   ?? (getStart(l) + 45);

/* =======================
   Build teacher name map
======================= */
async function fetchTeacherNames(lessons) {
  const ids = Array.from(new Set((lessons || []).map(l => l?.teacher).filter(Boolean).map(String)));
  const pairs = await Promise.all(ids.map(async (id) => {
    try {
      const res = await getUserById(id);
      if (!res?.ok) throw 0;
      const u = res.user || {};
      return [id, [u.firstname, u.lastname].filter(Boolean).join(" ") || "לא ידוע"];
    } catch {
      return [id, "שגיאה"];
    }
  }));
  return Object.fromEntries(pairs);
}

/* =======================
   Update lesson (shared)
======================= */
async function saveReschedule({ lesson, newDay, newRoom, newStartMin, onReload }) {
  const dur = Math.max(1, getEnd(lesson) - getStart(lesson));
  const start = Math.max(BASE_MIN, Math.min(newStartMin, END_MIN - 1));
  const end = Math.min(start + dur, 24 * 60);

  try {
    // ⚠️ אם אצלך updateLesson דורש עוד שדות – תוסיף כאן
    const payload = {
      name: lesson.name,
      teacher: lesson.teacher,
      list_students: lesson.list_students,
      room: newRoom, // number
      date: { day: newDay, startMin: start, endMin: end }
    };

    const res = await updateLesson(lesson._id, payload);

    if (res?.ok || res?.status === 200) {
      toast.success("עודכן בהצלחה");
      onReload?.();
    } else {
      toast.error(res?.message || "שגיאה בעדכון");
    }
  } catch (e) {
    toast.error("שגיאה בעדכון");
  }
}

/* =======================
   WEEK VIEW (days columns)
   Columns: days (1..7)
======================= */
function WeekTimeline({
  lessons,
  canEdit,
  showMyLessons,
  navigate,
  onReload,
  setTooltip,
  teacherNames,
}) {
  const byDay = useMemo(() => {
    const map = {1:[],2:[],3:[],4:[],5:[],6:[],7:[]};
    const uid = localStorage.getItem("user_id");
    const roles = localStorage.getItem("roles") || "";

    for (const l of (lessons || [])) {
      if (!l?.date) continue;
      const day = Number(l.date.day);
      if (!(day >= 1 && day <= 7)) continue;

      const isMine =
        String(l.teacher) === String(uid) ||
        (l.list_students || []).map(String).includes(String(uid));

      if (!showMyLessons || roles.includes("ادارة") || isMine) {
        map[day].push(l);
      }
    }

    for (const d of Object.keys(map)) {
      map[d].sort((a,b) => getStart(a) - getStart(b));
    }
    return map;
  }, [lessons, showMyLessons]);

  const hourMarks = Array.from({ length: 16 }, (_, i) => 8 + i); // 08..23

  return (
    <div className={styles.timelineGrid}>
      <div className={styles.headerSpacer} />
      {dayNames.map((dn, i) => (
        <div key={i} className={styles.dayHeader}>{dn}</div>
      ))}

      {/* hours gutter */}
      <div className={styles.hoursGutter}>
        {hourMarks.map((h, idx) => (
          <div key={idx}>
            <div className={styles.hourLine} style={{ top: `${(20 + h * 60 - BASE_MIN)}px` }} />
            <div className={styles.hourLabel} style={{ top: `${(20 + h * 60 - BASE_MIN)}px` }}>
              {String(h).padStart(2, "0")}:00
            </div>
          </div>
        ))}
      </div>

      {/* day columns */}
      {dayNames.map((_dn, idx) => {
        const day = idx + 1; // 1..7

        return (
          <div
            key={day}
            className={styles.dayCol}
            onClick={(e) => {
              if (!canEdit) return;
              if (!localStorage.getItem("roles")?.includes("ادارة")) return;

              const rect = e.currentTarget.getBoundingClientRect();
              const offsetY = e.clientY - rect.top;
              const clickedMin = BASE_MIN + Math.round(offsetY);

              navigate(`/lessons/new?day=${day}&startMin=${clickedMin}`);
            }}
            onDragOver={(e) => {
              if (canEdit && localStorage.getItem("roles")?.includes("ادارة")) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!canEdit) return;
              if (!localStorage.getItem("roles")?.includes("ادارة")) return;

              const lessonId = e.dataTransfer.getData("lesson-id");
              if (!lessonId) return;

              const rect = e.currentTarget.getBoundingClientRect();
              const offsetY = e.clientY - rect.top;
              const targetStartMin = BASE_MIN + Math.round(offsetY);

              const all = Object.values(byDay).flat();
              const l = all.find(x => String(x._id) === String(lessonId));
              if (!l) return;

              saveReschedule({
                lesson: l,
                newDay: day,
                newRoom: Number(l?.room ?? 0),
                newStartMin: targetStartMin,
                onReload
              });
            }}
          >
            {(byDay[day] || []).map((l) => {
              const top = 30 + minuteToPx(getStart(l));
              const height = Math.max(10, getEnd(l) - getStart(l));
              return (
                <div
                  key={l._id}
                  className={styles.lessonBlock}
                  style={{ top, height }}
                  draggable={canEdit && localStorage.getItem("roles")?.includes("ادارة")}
                  onClick={(ev) => {
                    if (!localStorage.getItem("roles")?.includes("ادارة")) return;
                    ev.stopPropagation();
                    navigate(`/lessons/${l._id}`);
                  }}
                  onDragStart={(e) => e.dataTransfer.setData("lesson-id", l._id)}
                  onMouseEnter={(e) => {
                    setTooltip?.({
                      show: true,
                      x: e.clientX,
                      y: e.clientY,
                      content: (
                        <>
                          <div><b>اسم:</b> {l.name}</div>
                          <div><b>مرشد:</b> {teacherNames?.[l.teacher] || "..."}</div>
                          <div><b>ساعة:</b> {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</div>
                          <div><b>يوم:</b> {dayNames[(Number(l.date.day) || 1) - 1]}</div>
                          <div><b>غرفة:</b> {Number(l?.room ?? 0) === 0 ? "لا يوجد" : l.room}</div>
                        </>
                      )
                    });
                  }}
                  onMouseMove={(e) => setTooltip?.({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip?.({ show: false })}
                >
                  <div className={styles.lessonTitle}>{l.name}</div>
                  <div className={styles.lessonMeta}>
                    {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}
                    {" · "}
                    {Number(l?.room ?? 0) === 0 ? "بدون غرفة" : `غرفة ${l.room}`}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* =======================
   DAY VIEW (rooms columns)
   Columns: rooms
======================= */
function DayRoomsTimeline({
  lessons,
  selectedDay,
  canEdit,
  showMyLessons,
  navigate,
  onReload,
  setTooltip,
  teacherNames,
}) {
  const roomsList = useMemo(() => {
    const uid = localStorage.getItem("user_id");
    const roles = localStorage.getItem("roles") || "";
    const set = new Set();

    for (const l of (lessons || [])) {
      if (!l?.date) continue;

      const isMine =
        String(l.teacher) === String(uid) ||
        (l.list_students || []).map(String).includes(String(uid));

      if (showMyLessons && !roles.includes("ادارة") && !isMine) continue;

      set.add(String(l?.room ?? 0));
    }

    if (set.size === 0) set.add("0");
    return Array.from(set).sort((a,b)=>Number(a)-Number(b));
  }, [lessons, showMyLessons]);

  const byRoom = useMemo(() => {
    const uid = localStorage.getItem("user_id");
    const roles = localStorage.getItem("roles") || "";
    const map = Object.fromEntries(roomsList.map(r => [r, []]));

    for (const l of (lessons || [])) {
      if (!l?.date) continue;
      if (Number(l.date.day) !== Number(selectedDay)) continue;

      const isMine =
        String(l.teacher) === String(uid) ||
        (l.list_students || []).map(String).includes(String(uid));

      if (showMyLessons && !roles.includes("ادارة") && !isMine) continue;

      const rk = String(l?.room ?? 0);
      (map[rk] ??= []).push(l);
    }

    for (const k of Object.keys(map)) {
      map[k].sort((a,b) => getStart(a) - getStart(b));
    }
    return map;
  }, [lessons, roomsList, selectedDay, showMyLessons]);

  const hourMarks = Array.from({ length: 16 }, (_, i) => 8 + i);

  return (
    <div className={styles.timelineGridRooms} style={{ ["--cols"]: roomsList.length }}>
      <div className={styles.headerSpacer} />
      {roomsList.map((r) => (
        <div key={r} className={styles.dayHeader}>
          {Number(r) === 0 ? "بدون غرفة" : `غرفة ${r}`}
        </div>
      ))}

      <div className={styles.hoursGutter}>
        {hourMarks.map((h, idx) => (
          <div key={idx}>
            <div className={styles.hourLine} style={{ top: `${(20 + h * 60 - BASE_MIN)}px` }} />
            <div className={styles.hourLabel} style={{ top: `${(20 + h * 60 - BASE_MIN)}px` }}>
              {String(h).padStart(2, "0")}:00
            </div>
          </div>
        ))}
      </div>

      {roomsList.map((room) => (
        <div
          key={room}
          className={styles.roomCol}
          onClick={(e) => {
            if (!canEdit) return;
            if (!localStorage.getItem("roles")?.includes("ادارة")) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const offsetY = e.clientY - rect.top;
            const clickedMin = BASE_MIN + Math.round(offsetY);

            navigate(`/lessons/new?day=${selectedDay}&room=${room}&startMin=${clickedMin}`);
          }}
          onDragOver={(e) => {
            if (canEdit && localStorage.getItem("roles")?.includes("ادارة")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!canEdit) return;
            if (!localStorage.getItem("roles")?.includes("ادارة")) return;

            const lessonId = e.dataTransfer.getData("lesson-id");
            if (!lessonId) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const offsetY = e.clientY - rect.top;
            const targetStartMin = BASE_MIN + Math.round(offsetY);

            const l = (lessons || []).find(x => String(x._id) === String(lessonId));
            if (!l) return;

            saveReschedule({
              lesson: l,
              newDay: Number(selectedDay),
              newRoom: Number(room),
              newStartMin: targetStartMin,
              onReload
            });
          }}
        >
          {(byRoom[room] || []).map((l) => {
            const top = 30 + minuteToPx(getStart(l));
            const height = Math.max(10, getEnd(l) - getStart(l));

            return (
              <div
                key={l._id}
                className={styles.lessonBlock}
                style={{ top, height }}
                draggable={canEdit && localStorage.getItem("roles")?.includes("ادارة")}
                onClick={(ev) => {
                  if (!localStorage.getItem("roles")?.includes("ادارة")) return;
                  ev.stopPropagation();
                  navigate(`/lessons/${l._id}`);
                }}
                onDragStart={(e) => e.dataTransfer.setData("lesson-id", l._id)}
                onMouseEnter={(e) => {
                  setTooltip?.({
                    show: true,
                    x: e.clientX,
                    y: e.clientY,
                    content: (
                      <>
                        <div><b>اسم:</b> {l.name}</div>
                        <div><b>مرشد:</b> {teacherNames?.[l.teacher] || "..."}</div>
                        <div><b>ساعة:</b> {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</div>
                        <div><b>يوم:</b> {dayNames[(Number(l.date.day) || 1) - 1]}</div>
                        <div><b>غرفة:</b> {Number(room) === 0 ? "لا يوجد" : room}</div>
                      </>
                    )
                  });
                }}
                onMouseMove={(e) => setTooltip?.({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip?.({ show: false })}
              >
                <div className={styles.lessonTitle}>{l.name}</div>
                <div className={styles.lessonMeta}>
                  {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* =======================
   MAIN PAGE
======================= */
export default function ViewAllLesson() {
  const navigate = useNavigate();

  const topAnchorRef = useRef(null);
  const [showFab, setShowFab] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => setShowFab(!entry.isIntersecting), { root: null });
    if (topAnchorRef.current) io.observe(topAnchorRef.current);
    return () => io.disconnect();
  }, []);

  // Month picker
  const [monthOffset, setMonthOffset] = useState(Number(localStorage.getItem("monthOffset")) || 0);
  const currentMonthInfo = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return {
      label: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
      month: d.getMonth() + 1,
      year: d.getFullYear(),
    };
  }, [monthOffset]);

  const [canEdit, setCanEdit] = useState(true);
  useEffect(() => { localStorage.setItem("canEdit", String(canEdit)); }, [canEdit]);

  const [isLoading, setIsLoading] = useState(false);
  const [lessons, setLessons] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherNames, setTeacherNames] = useState({});

  // Tooltips
  const [tooltipInfo, setTooltipInfo] = useState({ show:false, content:"", x:0, y:0 });

  // Filters
  const roles = localStorage.getItem("roles") || "";
  const [showMyLessons, setShowMyLessons] = useState(roles.includes("مرشد") || roles.includes("مساعد"));

  const [viewMode, setViewMode] = useState("week"); // "week" | "dayRooms"
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 1)); // 1..7

  const [filterDay, setFilterDay] = useState(0); // 0=all, 1..7 specific day (used mainly in week view)
  const [filterRoom, setFilterRoom] = useState("all"); // all | "0" | "1" | ...
  const [filterTeacher, setFilterTeacher] = useState("all"); // all | teacherId
  const [query, setQuery] = useState("");

  // Load teachers list (for filter dropdown)
  const loadTeachers = async () => {
    try {
      const res = await getAllUsers();
      if (!res?.ok) return setTeachers([]);
      setTeachers(res.users || []);
    } catch {
      setTeachers([]);
    }
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const res = await getAllLesson();
      if (!res?.ok) throw new Error(res?.message || "Load failed");

      const list = Array.isArray(res.lessons) ? res.lessons : [];
      // clean list_students
      const cleaned = list.map(lesson => ({
        ...lesson,
        list_students: Array.isArray(lesson.list_students)
          ? lesson.list_students.filter(x => x != null)
          : []
      }));

      setLessons(cleaned);

      // names map for tooltips
      const names = await fetchTeacherNames(cleaned);
      setTeacherNames(names);
    } catch {
      toast.error("שגיאה בטעינת השיעורים");
      setLessons([]);
      setTeacherNames({});
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadTeachers(); }, []);
  useEffect(() => { loadData(); }, [monthOffset]);

  // Options from lessons
  const roomOptions = useMemo(() => {
    const set = new Set((lessons || []).map(l => String(l?.room ?? 0)));
    if (set.size === 0) set.add("0");
    return Array.from(set).sort((a,b)=>Number(a)-Number(b));
  }, [lessons]);

  // Apply filters to a single list (always one calendar)
  const filteredLessons = useMemo(() => {
    const uid = localStorage.getItem("user_id");
    const rolesNow = localStorage.getItem("roles") || "";

    return (lessons || []).filter(l => {
      if (!l?.date) return false;

      // Filter day (global filter)
      if (filterDay !== 0 && Number(l.date.day) !== Number(filterDay)) return false;

      // Filter room
      const r = String(l?.room ?? 0);
      if (filterRoom !== "all" && r !== String(filterRoom)) return false;

      // Filter teacher
      if (filterTeacher !== "all" && String(l.teacher) !== String(filterTeacher)) return false;

      // Only my lessons (unless admin)
      if (showMyLessons && !rolesNow.includes("ادارة")) {
        const isMine =
          String(l.teacher) === String(uid) ||
          (l.list_students || []).map(String).includes(String(uid));
        if (!isMine) return false;
      }

      // search query by lesson name
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const name = String(l.name || "").toLowerCase();
        if (!name.includes(q)) return false;
      }

      return true;
    });
  }, [lessons, filterDay, filterRoom, filterTeacher, showMyLessons, query]);

  return (
    <div>
      <span ref={topAnchorRef} className={styles.fabAnchor} aria-hidden="true" />
      <h1 className={styles.title}>برنامج الدروس</h1>

      {/* ===== Filters + Controls ===== */}
      <div className={styles.controlsBar}>
        <div className={styles.controlsCenter}>
          <div className={styles.filterGroup}>
            <label>نوع الجدول</label>
            <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
              <option value="week">اسبوعي (ايام)</option>
              <option value="dayRooms">يومي (غراف)</option>
            </select>
          </div>

          {viewMode === "dayRooms" && (
            <div className={styles.filterGroup}>
              <label>يوم مختار</label>
              <select value={selectedDay} onChange={(e)=>setSelectedDay(Number(e.target.value))}>
                {dayNames.map((d, i)=>(
                  <option key={i+1} value={i+1}>{d}</option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.filterGroup}>
            <label>يوم مختار</label>
            <select value={filterDay} onChange={(e)=>setFilterDay(Number(e.target.value))}>
              <option value={0}>كل</option>
              {dayNames.map((d, i)=>(
                <option key={i+1} value={i+1}>{d}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label>غرفة</label>
            <select value={filterRoom} onChange={(e)=>setFilterRoom(e.target.value)}>
              <option value="all">كل</option>
              {roomOptions.map(r=>(
                <option key={r} value={r}>{Number(r) === 0 ? "بدون غرفة" : `غرفة ${r}`}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label>مرشد</label>
            <select value={filterTeacher} onChange={(e)=>setFilterTeacher(e.target.value)}>
              <option value="all">كل</option>
              {(teachers || []).map(t => (
                <option key={t._id} value={t._id}>{t.firstname} {t.lastname}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label>بحث</label>
            <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="שם שיעור..." />
          </div>

        </div>
      </div>

      {/* ===== Calendar (ONE) ===== */}
      {isLoading ? (
        <div className={styles.loaderWrap}>
          <div />
          {[...Array(7)].map((_, i) => <div key={i} className={styles.loaderBox} />)}
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className={styles.desktopView}>
            {viewMode === "week" ? (
              <WeekTimeline
                lessons={filteredLessons}
                canEdit={canEdit}
                showMyLessons={showMyLessons}
                navigate={navigate}
                onReload={loadData}
                setTooltip={(t)=> setTooltipInfo(prev => ({ ...prev, ...t }))}
                teacherNames={teacherNames}
              />
            ) : (
              <DayRoomsTimeline
                lessons={filteredLessons}
                selectedDay={selectedDay}
                canEdit={canEdit}
                showMyLessons={showMyLessons}
                navigate={navigate}
                onReload={loadData}
                setTooltip={(t)=> setTooltipInfo(prev => ({ ...prev, ...t }))}
                teacherNames={teacherNames}
              />
            )}
          </div>

          {/* Mobile (אפשר להשאיר רשימה פשוטה; כרגע נשאר week view כמו דסקטופ) */}
          <div className={styles.mobileView}>
            <div style={{ padding: 10 }}>
              {(filteredLessons || [])
                .sort((a,b) => (a.date.day - b.date.day) || (getStart(a) - getStart(b)))
                .map(l => (
                  <div key={l._id} className={styles.lessonCard}>
                    <div><b>{l.name}</b></div>
                    <div>{dayNames[(Number(l?.date?.day) || 1) - 1]} · {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</div>
                    <div>{Number(l?.room ?? 0) === 0 ? "بدون غرفة" : `غرفة ${l.room}`}</div>
                    <div>{teacherNames?.[l.teacher] || ""}</div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {/* Tooltip */}
      {tooltipInfo.show && (
        <div
          style={{
            position: "fixed",
            top: tooltipInfo.y + 12,
            left: tooltipInfo.x + 12,
            background: "black",
            color: "white",
            padding: 10,
            borderRadius: 6,
            pointerEvents: "none",
            zIndex: 9999,
            maxWidth: 300
          }}
        >
          {tooltipInfo.content}
        </div>
      )}

      <Fabtn
        anchor="#page-add-lesson"
        visible={showFab && localStorage.getItem("roles")?.includes("ادارة")}
        label="הוספת שיעור"
        onClick={() => {
          // אם dayRooms -> ניצור לפי selectedDay. אחרת לפי filterDay אם נבחר, אחרת יום 1.
          const day = viewMode === "dayRooms" ? selectedDay : (filterDay || 1);
          navigate(`/lessons/new?day=${day}&month=${currentMonthInfo.month}&year=${currentMonthInfo.year}`);
        }}
      />
    </div>
  );
}
