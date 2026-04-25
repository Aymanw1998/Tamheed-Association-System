import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
// עדכן את הנתיב לפי המבנה שלך:
import { changeStatus, generatePDF, getAll, /*softDelete fallback: deleteS */ } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./User.module.css";

import Fabtn from "../Global/Fabtn/Fabtn.jsx"
import { toast } from "../../ALERT/SystemToasts.jsx";
import { createLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { ask, setGlobalAsk } from "../Provides/confirmBus.js";
import UserStatusFilter from "./UserStatusFilter.jsx";
import { exportUserPdf } from "../ExportPDF/ExportPDF.jsx";
import { getStoredUserId, isStoredAdmin } from "../../utils/session";

const ViewAllUser = () => {
  const isAdmin = isStoredAdmin();
  const userId = getStoredUserId();
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
  const [users, setUsers] = useState([]);
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
      console.log("res getAllUser", res);
      if(!res.ok) throw new Error(res.message)
      const data = res.users;
      if (data && data.length > 0) {
        console.log("getAllUser", data)
        const filtered = data.filter((user) => String(user?._id ?? "") !== String(userId));
        setUsers(filtered);
      } else {
        setUsers([]);
      }
    } catch (e) {
      console.error("שגיאה בהבאת האימונים", e);
      setErr("يوجد خلل في جلب البيانات");
    } finally {
      setLoading(false);
    }
  }, []);
  const [status, setStatus] = useState('active'); // 'active' | 'pending' | 'inactive'
  useEffect(() => { loadStudent(); }, [loadStudent]);
  
  const sortedFilteredusers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    const filtered0 = q
      ? users.filter(s =>
          [s.tz, s.firstname, s.lastname, s.father_name, new Date().getFullYear() - new Date(s.birth_date).getFullYear(), ]
            .map(v => String(v ?? "").toLowerCase())
            .join(" ")
            .includes(q)
        )
      : users;
    console.log(filtered0, status);
    const filtered = filtered0.filter((user) => String(user?.room ?? "active") == status)
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
  }, [users, searchTerm, sortField, sortDir, status]);

  const handleAddStudent = async() => {
    navigate("/users/new");         // נתיב כמו שיש לך היום (תעדכני אם שונה)
  }
  
  const counts = useMemo(() => {
    let active = 0, pending = 0, inactive = 0;
    for (const u of users) {
      if (u.room === 'waiting') pending++;
      else if (u.room === 'noActive') inactive++;
      else active++;
    }
    return { active, pending, inactive };
  }, [users]);


  //ROOMS
  const onWaitingToActive = async (user) => {
    try {
    await changeStatus(user.tz, 'waiting', 'active');
    window.location.reload();
    toast.success("המשתמש אושר בהצלחה");
    } catch(err) { 
      console.error(err); 
      toast.error("שגיאה באישור המשתמש");
    }
  }
  const onNoActiveToActive = async (user) => {
    try {
    await changeStatus(user.tz, 'noActive', 'active');
    window.location.reload();
    toast.success("המשתמש שוחזר בהצלחה");
    } catch(err) { 
      console.error(err); 
      toast.error("שגיאה בשחזור המשתמש");
    }
  }
  const deleteU = async (user, from) => {
    try{
    console.log("deleteU", user.tz, from);
    await deleteUser(user.tz, from);
    window.location.reload();
    toast.success("המשתמש נמחק בהצלחה");
    } catch(err) { 
      console.error(err); 
      toast.error("שגיאה במחיקת המשתמש");
    }
  }
  return (
    <div>
      <div >
        <h1 style={{ textAlign: "center"}}>قائمة المستخدم</h1>

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

          <button 
            ref={addBtnRef}
            id="page-add-user"
            style={{ backgroundColor: 'green', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
            onClick={handleAddStudent}
          >
            ➕ إضافة مستخدم جديد
          </button>

          <button
            style={{ backgroundColor: '#374151', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
            onClick={loadStudent}
            disabled={loading}
          >
            {loading ? "جاري التحديث" : "🔄 تحديث القائمة"}
          </button>
        </div>
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <UserStatusFilter
            value={status}
            onChange={setStatus}
            counts={counts}      // תגים עם ספירה לכל מצב
            compact={false}      // אפשר true לגרסה קומפקטית
          />
        </div>

        <div style={{ marginTop: 8, opacity: 0.7 }}>
        مجموع: {sortedFilteredusers && sortedFilteredusers.length > 0 ? sortedFilteredusers.length: 0} المستخدمين {status === 'active' ? 'مُفاعلين' : status === 'pending' ? 'بالانتظار' : 'حسابات موقوفة'}
      </div>
      </div>

      {err && <div style={{ marginTop: 12, color: "#b91c1c" }}>{err}</div>}
      {!err && loading && <div style={{ marginTop: 12 }}>جاري تحديث البيانات</div>}

      {!loading && !err && (
        <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>رقم الهوية</th>
              <th>اسم المستخدم</th>
              <th>العمر</th>
              <th>الجنس</th>
              <th>الدور</th>
              <th>للمعلومات</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredusers.length > 0 ? (
              sortedFilteredusers.map((t) => (
                <tr key={t._id}>
                  <td data-label="رقم الهوية">{t.tz}</td>
                  <td data-label="اسم المستخدم">{t.firstname + " " + t.lastname}</td>
                  <td data-label="العمر">{new Date().getFullYear() - new Date(t.birth_date).getFullYear()}</td>
                  <td data-label="الجنس">{t.gender}</td>
                  <td data-label="الدور">{t.roles.join(", ")}</td>
                  <td data-label="للعملومات">
                    { t.room != "waiting" && t.room != "noActive" &&
                      <>
                        <button style={{ backgroundColor: 'yellow', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                        onClick={() => navigate(`/users/${t.tz}`)}>للتعريل</button>
                        <button style={{ backgroundColor: 'blue', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                        onClick={() => {
                          exportUserPdf(t) 
                        }}>تحميل ملف المستخدم</button>
    
                      </>
                    }
                    { t.room == "waiting" && 
                      <>
                        <button style={{ backgroundColor: 'green', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                        onClick={async() => await onWaitingToActive(t)}>✅ موافقة</button>
                        <button style={{ backgroundColor: 'red', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                        onClick={() => deleteU(t, 'waiting')}>🗑️ حذف</button>
                      </>
                    }
                    { t.room == "noActive" &&
                      <>
                        <button style={{ backgroundColor: 'green', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }}
                        onClick={async() => await onNoActiveToActive(t)}>♻️ تفعيل</button>
                        <button style={{ backgroundColor: 'red', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }}
                        onClick={() => deleteU(t, 'noActive')}>🗑️ حذف</button>
                      </>
                    }
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 16 }}>لا يوجد بيانات لاظهاره</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Fabtn
        anchor="#page-add-user"                     // או: showFab && canEdit אם תרצה רק כשיש הרשאת עריכה
        visible={showFab && localStorage.getItem("roles").includes("ادارة")}
        label="اضافة مستخدم جديد"
        onClick={() => {
          console.log('fab click');           // בדיקת קליק
          navigate(`/users/new`);
        }}
      />
    </div>
  );
};

export default ViewAllUser;
