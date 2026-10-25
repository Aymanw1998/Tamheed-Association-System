import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteS, getAll, update } from "../../WebServer/services/student/functionsStudent.jsx";
import useLiveRefresh from "../../locks/useLiveRefresh";
import styles from "./Student.module.css";
import Fabtn from "../Global/Fabtn/Fabtn";
import { toast } from "../../ALERT/SystemToasts";
import { exportStudentPdf } from "../ExportPDF/ExportPDF.jsx";
import { canStored } from "../../utils/session.js";
import StudentStatusFilter from "./StudentStatusFilter.jsx";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import { ParentLinkDialog } from "./ParentLinkPanel.jsx";
import MobileStudentList from "./MobileStudentList.jsx";

const ACTIVE_STATUS = "عادي";
const PENDING_STATUS = "ينتظر";

const STATUS_TONE = { active: "success", waiting: "warning", noActive: "neutral" };

const getStudentFilterKey = (student) => {
  const status = String(student?.status || "").trim();

  if (status === PENDING_STATUS) return "waiting";
  if (status === ACTIVE_STATUS || !status) return "active";
  return "noActive";
};

const getAge = (birthDate) => {
  if (!birthDate) return "-";
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return "-";
  return new Date().getFullYear() - date.getFullYear();
};

const ViewAllStudent = () => {
  const navigate = useNavigate();
  const isAdmin = canStored("students.viewAll");
  const canCreateStudents = canStored("students.create");
  const canParentLink = canStored("students.parentLink");

  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showFab, setShowFab] = useState(false);
  const [showParentLink, setShowParentLink] = useState(false);
  const [addBtnEl, setAddBtnEl] = useState(null);

  const addBtnRef = useCallback((node) => {
    setAddBtnEl(node);
  }, []);

  useEffect(() => {
    if (!addBtnEl) {
      setShowFab(false);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        setShowFab(!entry.isIntersecting);
      },
      { root: null, threshold: 0.01 }
    );

    io.observe(addBtnEl);
    return () => io.disconnect();
  }, [addBtnEl]);

  // quiet: a live refresh keeps the list on screen instead of showing the loading state.
  const loadStudent = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    if (!quiet) setErr(null);

    try {
      const res = await getAll();
      if (!res?.ok) {
        throw new Error(res?.message || "تعذّر تحميل البيانات");
      }

      // The server already scopes the list (responsible and lesson students).
      setStudents(Array.isArray(res.students) ? res.students : []);
    } catch (error) {
      console.error("Student load error", error);
      if (quiet) return;
      setErr("تعذّر تحميل البيانات");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudent();
  }, [loadStudent]);
  useLiveRefresh(["student", "lesson"], () => loadStudent({ quiet: true }));

  const counts = useMemo(() => {
    return students.reduce(
      (acc, student) => {
        const key = getStudentFilterKey(student);
        acc[key] += 1;
        if (key === "waiting") acc.pending += 1;
        if (key === "noActive") acc.inactive += 1;
        return acc;
      },
      { active: 0, pending: 0, inactive: 0, waiting: 0, noActive: 0 }
    );
  }, [students]);

  const sortedFilteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return students
      .filter((student) => {
        return getStudentFilterKey(student) === statusFilter;
      })
      .filter((student) => {
        if (!query) return true;

        const haystack = [
          student.tz,
          student.firstname,
          student.lastname,
          student.father_name,
          student.phone,
          student.email,
          student.school,
          student.layer,
          student.status,
          getAge(student.birth_date),
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .join(" ");

        return haystack.includes(query);
      })
      .sort((a, b) => {
        const aName = `${a.firstname || ""} ${a.lastname || ""}`.trim();
        const bName = `${b.firstname || ""} ${b.lastname || ""}`.trim();
        return aName.localeCompare(bName, "ar", { sensitivity: "base" });
      });
  }, [students, searchTerm, statusFilter]);

  const handleAddStudent = () => {
    navigate("/students/new");
  };
  const closeParentLink = useCallback(() => setShowParentLink(false), []);

  const handleApproveStudent = async (tz) => {
    const res = await update(tz, { status: ACTIVE_STATUS });
    if (!res?.ok) {
      toast.error(res?.message || "تعذّر قبول الطالب");
      return;
    }

    toast.success("تم قبول الطالب بنجاح");
    loadStudent();
  };

  const handleRejectStudent = async (tz) => {
    const res = await deleteS(tz);
    if (!res?.ok) {
      toast.error(res?.message || "تعذّر رفض الطالب");
      return;
    }

    toast.success("تم حذف الطالب من قائمة الانتظار");
    loadStudent();
  };

  return (
    <div>
      <div>
        <h1 className={styles.pageTitle}>
          {isAdmin ? "قائمة الطلاب" : "قائمة طلابي"}
        </h1>

        <div className={styles.toolbar} data-tour="students-toolbar">
          <input
            type="search"
            data-tour="students-search"
            placeholder="بحث…"
            aria-label="بحث في قائمة الطلاب"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {canCreateStudents && (
            <Button ref={addBtnRef} id="page-add-student" data-tour="students-add" onClick={handleAddStudent}>
              إضافة طالب جديد
            </Button>
          )}

          {canParentLink && (
            <Button variant="secondary" data-tour="students-parent-link" onClick={() => setShowParentLink(true)}>
              رابط تسجيل الأهل
            </Button>
          )}

          <Button variant="secondary" data-tour="students-refresh" onClick={loadStudent} loading={loading}>
            {loading ? "جارٍ التحديث…" : "تحديث القائمة"}
          </Button>
        </div>

        { isAdmin && <div data-tour="students-status-filter" style={{ marginTop: 12, marginBottom: 12 }}>
          <StudentStatusFilter
            value={statusFilter}
            onChange={setStatusFilter}
            counts={counts}
            compact={false}
          />
        </div>}

        <div className={styles.summary}>
          {statusFilter === "active"
            ? "الطلاب الفعّالون"
            : statusFilter === "waiting"
            ? "الطلاب بانتظار الموافقة"
            : "الطلاب غير الفعّالين"}: {sortedFilteredStudents.length}
        </div>
      </div>

      {err && <div className={styles.formError}>{err}</div>}
      {!err && loading && <div className={styles.emptyState}>جارٍ تحديث البيانات…</div>}

      {!loading && !err && (
        <div className={styles.mobileOnly}>
          <MobileStudentList
            students={sortedFilteredStudents}
            statusOf={getStudentFilterKey}
            toneOf={(student) => STATUS_TONE[getStudentFilterKey(student)]}
            onOpen={(student) => navigate(`/students/${student.tz}`)}
            onPdf={exportStudentPdf}
            onApprove={(student) => handleApproveStudent(student.tz)}
            onReject={(student) => handleRejectStudent(student.tz)}
          />
        </div>
      )}

      {!loading && !err && (
        <table data-tour="students-table" className={`table ${styles.subTable} ${styles.desktopOnly}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>رقم الهوية</th>
              <th>اسم الطالب</th>
              <th>اسم الأب</th>
              <th>العمر</th>
              <th>الجنس</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredStudents.length > 0 ? (
              sortedFilteredStudents.map((student) => (
                <tr key={student._id || student.tz}>
                  <td data-label="رقم الهوية">{student.tz}</td>
                  <td data-label="اسم الطالب">
                    {`${student.firstname || ""} ${student.lastname || ""}`.trim()}
                  </td>
                  <td data-label="اسم الأب">{student.father_name || "-"}</td>
                  <td data-label="العمر">{getAge(student.birth_date)}</td>
                  <td data-label="الجنس">{student.gender || "-"}</td>
                  <td data-label="الحالة">
                    <StatusBadge tone={STATUS_TONE[getStudentFilterKey(student)]}>
                      {student.status || ACTIVE_STATUS}
                    </StatusBadge>
                  </td>
                  <td data-label="الإجراءات">
                    <div className={styles.rowActions}>
                      {student.status === ACTIVE_STATUS && (
                        <>
                          <Button
                            size="sm"
                            variant="warning"
                            data-tour="students-open"
                            onClick={() => navigate(`/students/${student.tz}`)}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            data-tour="students-file"
                            onClick={() => exportStudentPdf(student)}
                          >
                            ملف الطالب
                          </Button>
                        </>
                      )}

                      {student.status === PENDING_STATUS && (
                        <>
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => handleApproveStudent(student.tz)}
                          >
                            قبول
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            data-tour="students-reject"
                            onClick={() => handleRejectStudent(student.tz)}
                          >
                            رفض
                          </Button>
                        </>
                      )}

                      {getStudentFilterKey(student) === "noActive" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/students/${student.tz}`)}
                        >
                          عرض التفاصيل
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className={styles.emptyState}>
                  لا يوجد طلاب في هذه القائمة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Fabtn
        anchor="#page-add-student"
        visible={showFab && canCreateStudents}
        label="إضافة طالب جديد"
        onClick={() => {
          navigate("/students/new");
        }}
      />
      {showParentLink && <ParentLinkDialog onClose={closeParentLink} />}
    </div>
  );
};

export default ViewAllStudent;
