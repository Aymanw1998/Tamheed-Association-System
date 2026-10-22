import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./Dashboard.module.css";
import { changeStatus, deleteU as deleteUser, getAll as getAllUsers } from "../../WebServer/services/user/functionsUser.jsx";
import { deleteS as deleteStudent, getAll as getAllStudents, update as updateStudent } from "../../WebServer/services/student/functionsStudent.jsx";
import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson.jsx";
import { getAll as getAllReports } from "../../WebServer/services/report/functionsReport.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { canStored, getStoredUserId } from "../../utils/session";
import ParentLinkPanel from "../Student/ParentLinkPanel.jsx";
import VehicleAlerts from "../Vehicle/VehicleAlerts.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { useRolePicker, permissionError } from "../User/RolePickerDialog.jsx";
import { roomLabel } from "../../utils/rooms";
import { dashboardLessons } from "../../utils/dashboardLessons";
import { DAY_NAMES } from "../../utils/lessonSchedule";

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
  const { t } = useI18n();
  const { pickRole, roleDialog } = useRolePicker();
  const canViewUsers = useMemo(() => canStored("users.view"), []);
  const canSeeAllLessons = useMemo(() => canStored("lessons.viewAll"), []);
  const canParentLink = useMemo(() => canStored("students.parentLink"), []);
  const canViewStudents = useMemo(() => canStored("students.view"), []);
  // Approving and rejecting pending students/users each follow their own
  // permission; the server checks every request.
  const canApproveStudents = useMemo(() => canStored("students.edit"), []);
  const canApproveUsers = useMemo(() => canStored("users.approve"), []);
  const canRejectUsers = useMemo(() => canStored("users.delete"), []);
  const canRejectStudents = useMemo(() => canStored("students.delete"), []);
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
          canViewUsers ? getAllUsers() : Promise.resolve({ ok: true, users: [] }),
          getAllStudents(),
          getAllLesson(),
          getAllReports(),
        ]);

        if (cancelled) return;
        const usersRes = usersResult.status === "fulfilled" ? usersResult.value : {};
        const studentsRes = studentsResult.status === "fulfilled" ? studentsResult.value : {};
        const lessonsRes = lessonsResult.status === "fulfilled" ? lessonsResult.value : {};
        const reportsRes = reportsResult.status === "fulfilled" ? reportsResult.value : {};

        // The system account never reaches the client (GET /user leaves it
        // out); the viewer doesn't count toward "المستخدمون".
        const currentUserId = String(getStoredUserId() || "");
        const users = (usersRes?.ok ? usersRes.users || [] : []).filter(
          (user) => String(user?._id ?? "") !== currentUserId
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
          users: canViewUsers && !usersRes?.ok,
          students: !studentsRes?.ok,
          lessons: !lessonsRes?.ok,
          reports: !reportsRes?.ok,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "تعذّر تحميل لوحة التحكم");
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
  }, [canViewUsers]);

  const lessonPanel = useMemo(
    () => dashboardLessons(data.lessons, now, { isAdmin: canSeeAllLessons, userId: getStoredUserId() }),
    [data.lessons, now, canSeeAllLessons]
  );

  const summary = useMemo(() => {
    const cards = [];

    // Managing accounts (the count itself, and approving/rejecting them) is
    // an admin-only capability - showing it to a guide/assistant would just
    // be a permanently-empty, non-actionable number.
    if (canViewUsers) {
      const activeUsers = data.users.filter((user) => user.room === "active").length;
      const waitingUsers = data.users.filter((user) => user.room === "waiting").length;
      cards.push(
        { label: "المستخدمون", value: activeUsers, failed: loadFailed.users },
        { label: "مستخدمون بانتظار الموافقة", value: waitingUsers, failed: loadFailed.users }
      );
    }

    cards.push(
      { label: "الطلاب", value: data.students.length, failed: loadFailed.students },
      { label: "دروس اليوم", value: lessonPanel.today.length, failed: loadFailed.lessons },
      { label: "التقارير", value: data.reports.length, failed: loadFailed.reports }
    );

    return cards;
  }, [data, loadFailed, canViewUsers, lessonPanel]);

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

  // Approval assigns a role (the server requires one).
  const handleApproveUser = async (user) => {
    const key = `user-approve-${user.tz}`;
    const role = await pickRole(user);
    if (!role) return;
    try {
      setActionLoading(key);
      const res = await changeStatus(user.tz, "waiting", "active", role);
      if (!res?.ok) throw new Error(permissionError(t, res));
      removeUserFromWaiting(user.tz);
      toast.success(t("perms.approved"));
    } catch (err) {
      toast.error(err.message || "تعذّر قبول المستخدم");
    } finally {
      setActionLoading("");
    }
  };

  const handleRejectUser = async (user) => {
    const key = `user-reject-${user.tz}`;
    try {
      setActionLoading(key);
      const res = await deleteUser(user.tz, "waiting");
      if (!res?.ok) throw new Error(res?.message || "تعذّر رفض المستخدم");
      setData((prev) => ({
        ...prev,
        users: prev.users.filter((item) => !(item.tz === user.tz && item.room === "waiting")),
      }));
      toast.success("تم رفض المستخدم وحذفه");
    } catch (err) {
      toast.error(err.message || "تعذّر رفض المستخدم");
    } finally {
      setActionLoading("");
    }
  };

  const handleApproveStudent = async (student) => {
    const key = `student-approve-${student.tz}`;
    try {
      setActionLoading(key);
      const res = await updateStudent(student.tz, { status: "عادي" });
      if (!res?.ok) throw new Error(res?.message || "تعذّر قبول الطالب");
      removeStudentFromPending(student.tz, "approve");
      toast.success("تم قبول الطالب بنجاح");
    } catch (err) {
      toast.error(err.message || "تعذّر قبول الطالب");
    } finally {
      setActionLoading("");
    }
  };

  const handleRejectStudent = async (student) => {
    const key = `student-reject-${student.tz}`;
    try {
      setActionLoading(key);
      const res = await deleteStudent(student.tz);
      if (!res?.ok) throw new Error(res?.message || "تعذّر رفض الطالب");
      removeStudentFromPending(student.tz, "reject");
      toast.success("تم رفض الطالب وحذفه");
    } catch (err) {
      toast.error(err.message || "تعذّر رفض الطالب");
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
      {roleDialog}
      <div className={styles.header}>
        <div>
          <h1>لوحة التحكم</h1>
          <p>نظرة سريعة على أهم بيانات النظام.</p>
        </div>
        <div className={styles.links} data-tour="dashboard-links">
          {canViewUsers && <Link to="/users">المستخدمون</Link>}
          {canViewStudents && <Link to="/students">الطلاب</Link>}
          <Link to="/lessons">الدروس</Link>
          <Link to="/reports">التقارير</Link>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.stats} data-tour="dashboard-stats">
        {summary.map((item) => (
          <div key={item.label} className={styles.statCard}>
            <span>{item.label}</span>
            <strong className={!loading && item.failed ? styles.statValueFailed : ""}>
              {loading ? "..." : item.failed ? "-" : item.value}
            </strong>
            {!loading && item.failed && <small className={styles.statHint}>تعذّر تحميل هذه البيانات</small>}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        <VehicleAlerts />
        {/* Shown only while someone is actually waiting. */}
        {canViewUsers && !loading && waitingUsers.length > 0 && (
          <section className={styles.panel} data-tour="dashboard-waiting-users">
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
                    {canApproveUsers && (
                      <button
                        type="button"
                        className={styles.approveBtn}
                        disabled={actionLoading === `user-approve-${user.tz}`}
                        onClick={() => handleApproveUser(user)}
                      >
                        قبول
                      </button>
                    )}
                    {canRejectUsers && (
                      <button
                        type="button"
                        className={styles.rejectBtn}
                        disabled={actionLoading === `user-reject-${user.tz}`}
                        onClick={() => handleRejectUser(user)}
                      >
                        رفض
                      </button>
                    )}
                  </div>
                </div>
            ))}
          </section>
        )}

        {canViewStudents && !loading && pendingStudents.length > 0 && (
          <section className={styles.panel} data-tour="dashboard-waiting-students">
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
                    {canApproveStudents && (
                      <button
                        type="button"
                        className={styles.approveBtn}
                        disabled={actionLoading === `student-approve-${student.tz}`}
                        onClick={() => handleApproveStudent(student)}
                      >
                        قبول
                      </button>
                    )}
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

        {canParentLink && (
          <section className={styles.panel} data-tour="dashboard-parent-link">
            <div className={styles.panelHeader}>
              <h2>رابط تسجيل الأهل</h2>
            </div>
            <ParentLinkPanel />
          </section>
        )}

        <section className={styles.panel} data-tour="dashboard-lessons">
          <div className={styles.panelHeader}>
            <h2>{canSeeAllLessons ? "دروس اليوم" : "دروسي اليوم"}</h2>
            <Link to="/lessons">كل الدروس</Link>
          </div>
          {loading ? (
            <p className={styles.empty}>جارٍ التحميل…</p>
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
                      data-tour="dashboard-lesson-enter"
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
