import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteS, getAll, update } from "../../WebServer/services/student/functionsStudent.jsx";
import styles from "./Student.module.css";
import Fabtn from "../Global/Fabtn/Fabtn";
import { toast } from "../../ALERT/SystemToasts";
import { createLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { ask } from "../Provides/confirmBus.js";
import { exportStudentPdf } from "../ExportPDF/ExportPDF.jsx";
import { getStoredUserId, isStoredAdmin } from "../../utils/session.js";
import StudentStatusFilter from "./StudentStatusFilter.jsx";

const ACTIVE_STATUS = "عادي";
const PENDING_STATUS = "ينتظر";

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
  const isAdmin = isStoredAdmin();
  const userId = getStoredUserId();

  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showFab, setShowFab] = useState(false);
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

  const loadStudent = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await getAll();
      if (!res?.ok) {
        throw new Error(res?.message || "يوجد خلل في جلب البيانات");
      }

      const data = Array.isArray(res.students) ? res.students : [];
      const filteredStudents = isAdmin
        ? data
        : data.filter((student) => String(student.main_teacher || "") === userId);

      setStudents(filteredStudents);
    } catch (error) {
      console.error("Student load error", error);
      setErr("يوجد خلل في جلب البيانات");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    loadStudent();
  }, [loadStudent]);

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

  const handleAddStudent = async () => {
    let toParent;

    try {
      toParent = await ask("", {
        title: "طريقة الإضافة",
        message:
          "كيف تفضلين إضافة الطالب؟\n\n" +
          "(1) إرسال رابط تعبئة إلى ولي الأمر\n" +
          "(2) أو إدخال يدوي عبر النظام",
        confirmText: "إرسال رابط",
        cancelText: "إضافة يدوية",
      });
    } catch (error) {
      console.error("ask error:", error);
      toast.error("نافذة التأكيد غير جاهزة الآن");
      return;
    }

    if (!toParent) {
      navigate("/students/new");
      return;
    }

    const res = await createLink();
    if (!res?.url) {
      toast.error(res?.message || "تعذر إنشاء الرابط");
      return;
    }

    try {
      await navigator.clipboard.writeText(res.url);
      toast.success("تم إنشاء الرابط ونسخه للحافظة");
    } catch (error) {
      toast.success("تم إنشاء الرابط");
    }
  };

  const handleApproveStudent = async (tz) => {
    const res = await update(tz, { status: ACTIVE_STATUS });
    if (!res?.ok) {
      toast.error(res?.message || "لم يتم قبول الطالب");
      return;
    }

    toast.success("تم قبول الطالب بنجاح");
    loadStudent();
  };

  const handleRejectStudent = async (tz) => {
    const res = await deleteS(tz);
    if (!res?.ok) {
      toast.error(res?.message || "لم يتم رفض الطالب");
      return;
    }

    toast.success("تم حذف الطالب من قائمة الانتظار");
    loadStudent();
  };

  return (
    <div>
      <div>
        <h1 style={{ textAlign: "center" }}>
          {isAdmin ? "قائمة الطلاب" : "قائمة طلابي"}
        </h1>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="بحث..."
            style={{
              width: "80%",
              padding: "10px",
              margin: "10px",
              marginBottom: "20px",
              fontSize: "14px",
              border: "1px solid #ccc",
              borderRadius: "8px",
            }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {isAdmin && (
            <button
              ref={addBtnRef}
              id="page-add-student"
              style={{
                backgroundColor: "green",
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                color: "white",
              }}
              onClick={handleAddStudent}
            >
              إضافة طالب جديد
            </button>
          )}

          <button
            style={{
              backgroundColor: "#374151",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              color: "white",
            }}
            onClick={loadStudent}
            disabled={loading}
          >
            {loading ? "جاري التحديث" : "تحديث القائمة"}
          </button>
        </div>

        { isAdmin && <div style={{ marginTop: 12, marginBottom: 12 }}>
          <StudentStatusFilter
            value={statusFilter}
            onChange={setStatusFilter}
            counts={counts}
            compact={false}
          />
        </div>}

        <div style={{ marginTop: 8, opacity: 0.7 }}>
          مجموع: {sortedFilteredStudents.length} طالب{" "}
          {statusFilter === "active"
            ? "مُفعاليّن"
            : statusFilter === "waiting"
            ? "بانتظار الموافقة"
            : "غير فعالين"}
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: "#b91c1c" }}>{err}</div>}
      {!err && loading && <div style={{ marginTop: 12 }}>جاري تحديث البيانات</div>}

      {!loading && !err && (
        <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>رقم الهوية</th>
              <th>اسم الطالب</th>
              <th>اسم الأب</th>
              <th>العمر</th>
              <th>الجنس</th>
              <th>الحالة</th>
              <th>للإجراءات</th>
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
                  <td data-label="الحالة">{student.status || ACTIVE_STATUS}</td>
                  <td data-label="للإجراءات">
                    {student.status === ACTIVE_STATUS && (
                      <>
                        <button
                          style={{
                            backgroundColor: "#eab308",
                            padding: "0.5rem 1rem",
                            borderRadius: "0.5rem",
                            color: "white",
                            alignItems: "center",
                          }}
                          onClick={() => navigate(`/students/${student.tz}`)}
                        >
                          للتعديل
                        </button>
                        <button
                          style={{
                            backgroundColor: "#2563eb",
                            padding: "0.5rem 1rem",
                            borderRadius: "0.5rem",
                            color: "white",
                            alignItems: "center",
                          }}
                          onClick={() => exportStudentPdf(student)}
                        >
                          تحميل ملف الطالب
                        </button>
                      </>
                    )}

                    {student.status === PENDING_STATUS && (
                      <>
                        <button
                          style={{
                            marginLeft: 8,
                            backgroundColor: "green",
                            padding: "0.5rem 1rem",
                            borderRadius: "0.5rem",
                            color: "white",
                            alignItems: "center",
                          }}
                          onClick={() => handleApproveStudent(student.tz)}
                        >
                          قبول
                        </button>
                        <button
                          style={{
                            marginLeft: 8,
                            backgroundColor: "red",
                            padding: "0.5rem 1rem",
                            borderRadius: "0.5rem",
                            color: "white",
                            alignItems: "center",
                          }}
                          onClick={() => handleRejectStudent(student.tz)}
                        >
                          رفض
                        </button>
                      </>
                    )}

                    {getStudentFilterKey(student) === "noActive" && (
                      <button
                        style={{
                          backgroundColor: "#2563eb",
                          padding: "0.5rem 1rem",
                          borderRadius: "0.5rem",
                          color: "white",
                          alignItems: "center",
                        }}
                        onClick={() => navigate(`/students/${student.tz}`)}
                      >
                        عرض التفاصيل
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 16 }}>
                  لا يوجد طلاب في هذا القسم
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Fabtn
        anchor="#page-add-student"
        visible={showFab && isAdmin}
        label="اضافة طالب جديد"
        onClick={() => {
          navigate("/students/new");
        }}
      />
    </div>
  );
};

export default ViewAllStudent;
