import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./Dashboard.module.css";
import { changeStatus, deleteU as deleteUser, getAll as getAllUsers } from "../../WebServer/services/user/functionsUser.jsx";
import { deleteS as deleteStudent, getAll as getAllStudents, update as updateStudent } from "../../WebServer/services/student/functionsStudent.jsx";
import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson.jsx";
import { getAll as getAllReports } from "../../WebServer/services/report/functionsReport.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { GUIDE_ROLES, getStoredUserId, hasStoredRole, isStoredAdmin } from "../../utils/session";
import ParentLinkPanel from "../Student/ParentLinkPanel.jsx";
import VehicleAlerts from "../Vehicle/VehicleAlerts.jsx";
import { roomLabel } from "../../utils/rooms";
import { dashboardLessons } from "../../utils/dashboardLessons";
import { DAY_NAMES } from "../../utils/lessonSchedule";

// The bootstrap system-admin account (see server/scripts/ensureSystemAdmin.js)
// isn't a real member of the association - it, and whoever is currently
// viewing the dashboard, shouldn't count toward "المستخدمون".
const SYSTEM_ADMIN_TZ = "000000000";

// A مرشد can approve a pending student (PUT /student/:tz) but only ادارة can
// reject/delete one, so the dashboard needs to tell "guide" apart from
// "assistant" (مساعد), who can do neither.

const formatLessonTime = (lesson) => {
  const start = Number(lesson?.date?.startMin);
  if (!Number.isFinite(start)) return "-";
  const hours = String(Math.floor(start / 60)).padStart(2, "0");
  const minutes = String(start % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const moreLessonsLabel = (count) =>
  count === 1 ? "ودرس آخر" : count === 2 ? "ودرسان آخران" : `و${count} دروس أخرى`;

export default function Dashboard() {
  const navigate = useNavigate();
  const isAdmin = useMemo(() => isStoredAdmin(), []);
  const isGuide = useMemo(() => hasStoredRole(...GUIDE_ROLES), []);
  const canApproveStudents = isAdmin || isGuide;
  const canRejectStudents = isAdmin;
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState({
    users: [],
    students: [],
    lessons: [],
    reports: [],
  });
  // Which stat cards reflect a fetch that actually failed, vs. a genuine
  // zero - a silent failure here used to render as an indistinguishable "0".
  const [loadFailed, setLoadFailed] = useState({ users: false, students: false, lessons: false, reports: false });

  // Re-evaluated every minute so "now" and "next" move along with the clock.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const [usersResult, studentsResult, lessonsResult, reportsResult] = await Promise.allSettled([
          isAdmin ? getAllUsers() : Promise.resolve({ ok: true, users: [] }),
          getAllStudents(),
          getAllLesson(),
          getAllReports(),
        ]);

        if (cancelled) return;
        const usersRes = usersResult.status === "fulfilled" ? usersResult.value : {};
        const studentsRes = studentsResult.status === "fulfilled" ? studentsResult.value : {};
        const lessonsRes = lessonsResult.status === "fulfilled" ? lessonsResult.value : {};
        const reportsRes = reportsResult.status === "fulfilled" ? reportsResult.value : {};

        const currentUserId = String(getStoredUserId() || "");
        const users = (usersRes?.ok ? usersRes.users || [] : []).filter(
          (user) => String(user?.tz ?? "") !== SYSTEM_ADMIN_TZ && String(user?._id ?? "") !== currentUserId
        );

        setData({
          users,
          students: studentsRes?.ok ? studentsRes.students || [] : [],
          lessons: lessonsRes?.ok ? lessonsRes.lessons || [] : [],
          reports: reportsRes?.ok ? reportsRes.reports || [] : [],
        });
        setLoadFailed({
          // Non-admins deliberately skip the users fetch (see the Promise.resolve
          // above) - that's not a failure, only an actual !ok response is.
          users: isAdmin && !usersRes?.ok,
          students: !studentsRes?.ok,
          lessons: !lessonsRes?.ok,
          reports: !reportsRes?.ok,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "تعذر تحميل لوحة التحكم");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const lessonPanel = useMemo(
    () => dashboardLessons(data.lessons, now, { isAdmin, userId: getStoredUserId() }),
    [data.lessons, now, isAdmin]
  );

  const summary = useMemo(() => {
    const cards = [];

    // Managing accounts (the count itself, and approving/rejecting them) is
    // an admin-only capability - showing it to a guide/assistant would just
    // be a permanently-empty, non-actionable number.
    if (isAdmin) {
      const activeUsers = data.users.filter((user) => user.room === "active").length;
      const waitingUsers = data.users.filter((user) => user.room === "waiting").length;
      cards.push(
        { label: "المستخدمون", value: activeUsers, failed: loadFailed.users },
        { label: "مستخدمون بانتظار الموافقة", value: waitingUsers, failed: loadFailed.users }
      );
    }

    cards.push(
      { label: "الطلاب", value: data.students.length, failed: loadFailed.students },
      { label: "الدروس اليوم", value: lessonPanel.today.length, failed: loadFailed.lessons },
      { label: "التقارير", value: data.reports.length, failed: loadFailed.reports }
    );

    return cards;
  }, [data, loadFailed, isAdmin, lessonPanel]);

  const waitingUsers = useMemo(
    () => data.users.filter((user) => user.room === "waiting").slice(0, 5),
    [data.users]
  );

  const pendingStudents = useMemo(
    () => data.students.filter((student) => String(student.status || "") === "ينتظر").slice(0, 5),
    [data.students]
  );


  const removeUserFromWaiting = (tz) => {
    setData((prev) => ({
      ...prev,
      users: prev.users.map((user) =>
        user.tz === tz ? { ...user, room: "active" } : user
      ),
    }));
  };

  const removeStudentFromPending = (tz, mode = "approve") => {
    setData((prev) => ({
      ...prev,
      students:
        mode === "approve"
          ? prev.students.map((student) =>
              student.tz === tz ? { ...student, status: "عادي" } : student
            )
          : prev.students.filter((student) => student.tz !== tz),
    }));
  };

  const handleApproveUser = async (user) => {
    const key = `user-approve-${user.tz}`;
    try {
      setActionLoading(key);
      const res = await changeStatus(user.tz, "waiting", "active");
      if (!res?.ok) throw new Error(res?.message || "تعذر قبول المستخدم");
      removeUserFromWaiting(user.tz);
      toast.success("تمت الموافقة على المستخدم");
    } catch (err) {
      toast.error(err.message || "تعذر قبول المستخدم");
    } finally {
      setActionLoading("");
    }
  };

  const handleRejectUser = async (user) => {
    const key = `user-reject-${user.tz}`;
    try {
      setActionLoading(key);
      const res = await deleteUser(user.tz, "waiting");
      if (!res?.ok) throw new Error(res?.message || "تعذر رفض المستخدم");
      setData((prev) => ({
        ...prev,
        users: prev.users.filter((item) => !(item.tz === user.tz && item.room === "waiting")),
      }));
      toast.success("تم رفض المستخدم وحذفه");
    } catch (err) {
      toast.error(err.message || "تعذر رفض المستخدم");
    } finally {
      setActionLoading("");
    }
  };

  const handleApproveStudent = async (student) => {
    const key = `student-approve-${student.tz}`;
    try {
      setActionLoading(key);
      const res = await updateStudent(student.tz, { status: "عادي" });
      if (!res?.ok) throw new Error(res?.message || "تعذر قبول الطالب");
      removeStudentFromPending(student.tz, "approve");
      toast.success("تمت الموافقة على الطالب");
    } catch (err) {
      toast.error(err.message || "تعذر قبول الطالب");
    } finally {
      setActionLoading("");
    }
  };

  const handleRejectStudent = async (student) => {
    const key = `student-reject-${student.tz}`;
    try {
      setActionLoading(key);
      const res = await deleteStudent(student.tz);
      if (!res?.ok) throw new Error(res?.message || "تعذر رفض الطالب");
      removeStudentFromPending(student.tz, "reject");
      toast.success("تم رفض الطالب وحذفه");
    } catch (err) {
      toast.error(err.message || "تعذر رفض الطالب");
    } finally {
      setActionLoading("");
    }
  };

  const openLessonAttendance = (lesson) => {
    navigate("/calendar", {
      state: {
        lessonId: lesson?._id || "",
        lessonName: lesson?.name || "",
      },
    });
  };

  return (
    <section className={styles.page} dir="rtl">
      <div className={styles.header}>
        <div>
          <h1>لوحة التحكم</h1>
          <p>عرض سريع وبسيط لأهم بيانات النظام.</p>
        </div>
        <div className={styles.links}>
          {isAdmin && <Link to="/users">المستخدمون</Link>}
          {canApproveStudents && <Link to="/students">الطلاب</Link>}
          <Link to="/lessons">الدروس</Link>
          <Link to="/reports">التقارير</Link>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.stats}>
        {summary.map((item) => (
          <div key={item.label} className={styles.statCard}>
            <span>{item.label}</span>
            <strong className={!loading && item.failed ? styles.statValueFailed : ""}>
              {loading ? "..." : item.failed ? "-" : item.value}
            </strong>
            {!loading && item.failed && <small className={styles.statHint}>تعذر تحميل هذه البيانات</small>}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        <VehicleAlerts />
        {/* Shown only while someone is actually waiting. */}
        {isAdmin && !loading && waitingUsers.length > 0 && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>مستخدمون بانتظار الموافقة</h2>
              <Link to="/users">فتح</Link>
            </div>
            {waitingUsers.map((user) => (
                <div key={`${user.tz}-${user.room}`} className={styles.row}>
                  <div>
                    <strong>{user.firstname || "-"} {user.lastname || ""}</strong>
                    <span>{user.tz}</span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.approveBtn}
                      disabled={actionLoading === `user-approve-${user.tz}`}
                      onClick={() => handleApproveUser(user)}
                    >
                      قبول
                    </button>
                    <button
                      type="button"
                      className={styles.rejectBtn}
                      disabled={actionLoading === `user-reject-${user.tz}`}
                      onClick={() => handleRejectUser(user)}
                    >
                      رفض
                    </button>
                  </div>
                </div>
            ))}
          </section>
        )}

        {canApproveStudents && !loading && pendingStudents.length > 0 && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>طلاب بانتظار الموافقة</h2>
              <Link to="/students">فتح</Link>
            </div>
            {pendingStudents.map((student) => (
                <div key={student.tz} className={styles.row}>
                  <div>
                    <strong>{student.firstname || "-"} {student.lastname || ""}</strong>
                    <span>{student.tz}</span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.approveBtn}
                      disabled={actionLoading === `student-approve-${student.tz}`}
                      onClick={() => handleApproveStudent(student)}
                    >
                      قبول
                    </button>
                    {canRejectStudents && (
                      <button
                        type="button"
                        className={styles.rejectBtn}
                        disabled={actionLoading === `student-reject-${student.tz}`}
                        onClick={() => handleRejectStudent(student)}
                      >
                        رفض
                      </button>
                    )}
                  </div>
                </div>
            ))}
          </section>
        )}

        {isAdmin && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>رابط تسجيل الأهل</h2>
            </div>
            <ParentLinkPanel />
          </section>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>{isAdmin ? "دروس اليوم" : "دروسي اليوم"}</h2>
            <Link to="/lessons">كل الدروس</Link>
          </div>
          {loading ? (
            <p className={styles.empty}>جاري التحميل...</p>
          ) : (
            <>
              {lessonPanel.today.length === 0 && (
                <p className={styles.empty}>لا توجد دروس اليوم.</p>
              )}
              {/* Three lessons visible; the rest scroll. */}
              <div className={styles.lessonScroll}>
              {lessonPanel.today.map(({ lesson, state }) => (
                <div
                  key={lesson._id || lesson.name}
                  className={`${styles.row} ${state === "done" ? styles.rowDone : ""} ${state === "now" ? styles.rowNow : ""}`}
                >
                  <div>
                    <strong>
                      {lesson.name || "درس"}
                      {state === "now" && <span className={styles.lessonTagNow}>الآن</span>}
                      {state === "next" && <span className={styles.lessonTagNext}>التالي</span>}
                    </strong>
                    <span>{roomLabel(lesson.room)}</span>
                  </div>
                  <div className={styles.actions}>
                    <em>{formatLessonTime(lesson)}</em>
                    <button
                      type="button"
                      className={styles.openBtn}
                      onClick={() => openLessonAttendance(lesson)}
                    >
                      دخول
                    </button>
                  </div>
                </div>
              ))}
              </div>

              {lessonPanel.upcoming && (
                <>
                  <h3 className={styles.upcomingTitle}>
                    الدروس القادمة: {DAY_NAMES[lessonPanel.upcoming.day - 1]} ({lessonPanel.upcoming.lessons.length})
                  </h3>
                  {lessonPanel.upcoming.lessons.slice(0, 5).map((lesson) => (
                    <div key={lesson._id || lesson.name} className={styles.row}>
                      <div>
                        <strong>{lesson.name || "درس"}</strong>
                        <span>{roomLabel(lesson.room)}</span>
                      </div>
                      <div className={styles.actions}>
                        <em>{formatLessonTime(lesson)}</em>
                      </div>
                    </div>
                  ))}
                  {lessonPanel.upcoming.lessons.length > 5 && (
                    <Link to="/lessons" className={styles.moreLink}>
                      {moreLessonsLabel(lessonPanel.upcoming.lessons.length - 5)} ←
                    </Link>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
