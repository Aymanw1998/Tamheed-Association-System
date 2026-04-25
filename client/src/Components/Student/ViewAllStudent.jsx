import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
// עדכן את הנתיב לפי המבנה שלך:
import { getAll, update, /*softDelete fallback: deleteS */ } from "../../WebServer/services/student/functionsStudent.jsx";
import styles from "./Student.module.css";

import Fabtn from "../Global/Fabtn/Fabtn"
import { toast } from "../../ALERT/SystemToasts";
import { createLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { ask, setGlobalAsk } from "../Provides/confirmBus.js";
import { exportStudentPdf } from "../ExportPDF/ExportPDF.jsx";

const ViewAllStudent = () => {
  const [showFab, setShowFab] = useState(false);
    const [addBtnEl, setAddBtnEl] = useState(null);
    const addBtnRef = useCallback((node) => {
      setAddBtnEl(node); // node = DOM element of the main button (or null)
    }, []);
  
    useEffect(() => {
      // if button not rendered (no admin) -> hide FAB
      if (!addBtnEl) {
        setShowFab(false);
        return;
      }
  
      const io = new IntersectionObserver(
        ([entry]) => {
          // if main button is NOT in viewport -> show FAB
          setShowFab(!entry.isIntersecting);
        },
        { root: null, threshold: 0.01 }
      );
  
      io.observe(addBtnEl);
      return () => io.disconnect();
    }, [addBtnEl]);
  
  
  
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("name");      // "name" | "price"
  const [sortDir, setSortDir] = useState("asc");           // "asc" | "desc"
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const loadStudent = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await getAll();
      if(!res.ok) throw new Error(res.message)
      const data = res.students;
      if (data && data.length > 0) {
        console.log("roles", localStorage.getItem("roles"))
        console.log("getAllStudent", data, localStorage.getItem("roles"), localStorage.getItem("roles").includes("ادارة"))
        const filtered = localStorage.getItem("roles").includes("ادارة") ? data :  data.filter(s => s.main_teacher == localStorage.getItem("user_id"));
        console.log("getAllStudent", filtered)
        setStudents(filtered);
      } else {
        setStudents([]);
      }
    } catch (e) {
      console.error("שגיאה בהבאת האימונים", e);
      setErr("يوجد خلل في جلب البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStudent(); }, [loadStudent]);
  const sortedFilteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    const filtered = q
      ? students.filter(s =>
          [s.tz, s.firstname, s.lastname, s.father_name, new Date().getFullYear() - new Date(s.birth_date).getFullYear(), ]
            .map(v => String(v ?? "").toLowerCase())
            .join(" ")
            .includes(q)
        )
      : students;

    const dirMul = sortDir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortField === "info") {
        const an = String(a.info ?? "");
      const bn = String(b.info ?? "");
      return an.localeCompare(bn, "he", { sensitivity: "base" }) * dirMul;
      }
      // name (ברירת מחדל)
      const an = String(a.name ?? "");
      const bn = String(b.name ?? "");
      return an.localeCompare(bn, "he", { sensitivity: "base" }) * dirMul;
    });
  }, [students, searchTerm, sortField, sortDir]);

  const handleAddStudent = async() => {
    let toParent;

    try {
      toParent = await ask("",{
        title: "طريقة الإضافة",
        message:
          "كيف تفضلي إضافة الطالب؟\n\n" +
          "(1) إرسال رابط تعبئة إلى ولي الأمر\n" +
          "(2) أو إدخال يدوي عبر النظام",
        confirmText: "إرسال رابط",
        cancelText: "إضافة يدوية",
      });
    } catch (e) {
      console.error("ask error:", e);
      toast.error("חלון האישור לא מוכן (Confirm not ready yet)");
      return;
    }

    // ❌ המורה בחרה "ביטול" → כניסה למסך יצירה ידנית
    if (!toParent) {
      navigate("/students/new");         // נתיב כמו שיש לך היום (תעדכני אם שונה)
      return;
    }

    // ✅ יצירת קישור להורה
    const res = await createLink();
    if (!res.url) {
      toast.error(res.message);
      return;
    }

    // להעתיק אוטומטית ללוח
    try {
      await navigator.clipboard.writeText(res.url);
      toast.success("✅ נוצר קישור ונעתק ללוח. שלחי אותו להורה בוואטסאפ / מייל.");
    } catch {
      toast.success("✅ נוצר קישור. העתקי ושלחי להורה:");
    }

    // navigate("/students/new");
  }
  const changeStatusStudent = async(tz) => {
    const res = await update(tz, {status:"عادي"});
    if(!res.ok) {
      toast.error("لم يتم قبول الطالب: ");
      return;
    }
    toast.success("تم قبول الطالب بنجاح");
    loadStudent();
  }
  return (
    <div>
      <div >
        <h1 style={{ textAlign: "center"}}>{localStorage.getItem("roles").includes("ادارة") ? "قائمة الطلاب" : "قائمة طلابي"}</h1>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="بحث..."
            style={{
              width: "80%", padding: "10px", margin: "10px", marginBottom: "20px",fontSize: "14px", 
              border: "1px solid #ccc",borderRadius: "8px"
            }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {localStorage.getItem("roles").includes("ادارة") && <button 
            ref={addBtnRef}
            id="page-add-student"
            style={{ backgroundColor: 'green', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
            onClick={handleAddStudent}
          >
            ➕ إضافة طالب جديد
          </button>
}
          <button
            style={{ backgroundColor: '#374151', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
            onClick={loadStudent}
            disabled={loading}
          >
            {loading ? "جاري التحديث" : "🔄 تحديث القائمة"}
          </button>
        </div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
        مجموع: {sortedFilteredStudents && sortedFilteredStudents.length > 0 ? sortedFilteredStudents.length: 0} الطلاب
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
              <th>اسم الاب</th>
              <th>العمر</th>
              <th>الجنس</th>
              <th>للمعلومات</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredStudents.length > 0 ? (
              sortedFilteredStudents.map((t) => (
                <tr key={t._id}>
                  <td data-label="رقم الهوية">{t.tz}</td>
                  <td data-label="اسم الطالب">{t.firstname + " " + t.lastname}</td>
                  <td data-label="اسم الاب">{t.father_name}</td>
                  <td data-label="العمر">{new Date().getFullYear() - new Date(t.birth_date).getFullYear()}</td>
                  <td data-label="الجنس">{t.gender}</td>
                  <td data-label="للعملومات">
                    {t.status === "عادي" &&<>
                    <button style={{ backgroundColor: 'yellow', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                    onClick={() => navigate(`/students/${t.tz}`)}>للتعريل</button>
                    <button style={{ backgroundColor: 'blue', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                    onClick={() => {
                      exportStudentPdf(t) 
                    }}>تحميل ملف الطالب</button>
                    </>
                    }
                    {t.status === "ينتظر" && <>
                    <button 
                      style={{ marginLeft: 8, backgroundColor: 'green', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }}
                      onClick={()=>changeStatusStudent(t.tz)}>قبول</button>
                    <button style={{ marginLeft: 8, backgroundColor: 'red', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }}>رفض</button></>}
                    {/* <button style={{ backgroundColor: 'blue', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                    onClick={() => generateStudentPDF(t.tz)}>تحميل ملف الطالب</button> */}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 16 }}>لا يوجد بيانات لاظهاره</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Fabtn
        anchor="#page-add-student"                     // או: showFab && canEdit אם תרצה רק כשיש הרשאת עריכה
        visible={showFab && localStorage.getItem("roles").includes("ادارة")}
        label="اضافة طالب جديد"
        onClick={() => {
          console.log('fab click');           // בדיקת קליק
          navigate(`/students/new`);
        }}
      />
    </div>
  );
};

export default ViewAllStudent;
