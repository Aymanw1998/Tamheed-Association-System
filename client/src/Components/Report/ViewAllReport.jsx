import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
// עדכן את הנתיב לפי המבנה שלך:
import { getAll, update, /*softDelete fallback: deleteS */ } from "../../WebServer/services/report/functionsReport.jsx";
import {getAll as getUsers} from "../../WebServer/services/user/functionsUser.jsx"
import styles from "./Report.module.css";

import Fabtn from "../Global/Fabtn/Fabtn.jsx"
import { toast } from "../../ALERT/SystemToasts.jsx";
const toDate = (value) =>{
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);

  if (typeof value === 'string') {
      const s = value.trim();

      // dd-mm-yyyy או dd/mm/yyyy
      let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
      if (m) {
      const [, dd, mm, yyyy] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd)); // UTC כדי להימנע מהפתעות שעון קיץ
      }

      // yyyy-mm-dd (ISO קצר)
      m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
      const [, yyyy, mm, dd] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
      }

      const ts = Date.parse(s);
      if (!Number.isNaN(ts)) return new Date(ts);
  }
  return null; // לא תקין
}

const formData = (value) => {
  const d = toDate(value);
  if (!d) return "";
return d.toLocaleDateString("en-GB");
}

const dayName = (value) => {
  const d = toDate(value);
  if (!d) return "";
  return ["الاحد", "الاثنين", "الثلاثاء","الاربعاء", "الخميس","الجمعة","السبت"][d.getDay()];
}
const ViewAllReport = () => {
  const topAnchorRef = useRef(null);
  const [showFab, setShowFab] = useState(false);

    // אם גוללים והעוגן לא נראה – נראה FAB
    useEffect(() => {
      // אם הגלילה נעשית בתוך קונטיינר פנימי עם overflow:auto,
      // אפשר להחליף ל-root: scrollEl
      const io = new IntersectionObserver(
        ([entry]) => setShowFab(!entry.isIntersecting),
        { root: null } // viewport
      );
      if (topAnchorRef.current) io.observe(topAnchorRef.current);
      return () => io.disconnect();
    }, []);
  
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  console.log("reports", reports);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("name");      // "name" | "price"
  const [sortDir, setSortDir] = useState("asc");           // "asc" | "desc"
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [filters, setFilters] = useState({
    day: "",
    title: "",
    dateFrom: "",
    dateTo: "",
    createBy: "",
  });

  const loadReport = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const resU = await getUsers();
      const res = await getAll();
      console.log("res getAllReport", res);
      if(!res.ok) throw new Error(res.message)
        const data = res.reports;
      if (data && data.length > 0) {
        console.log("getAllReport", data)
        const usersById = resU?.ok
          ? Object.fromEntries(resU.users.map(u => [String(u._id), u]))
          : {};

        const enriched = (data).map(r => {
          console.log("r",r);
          const u = usersById[String(r.createdBy)];
          const name = u ? `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() : "لا يوجد";

          return {
            ...r,
            createdBy: name, // לא לדרוס createBy המקורי
          };
        });

        setReports(enriched);
      } else {
        setReports([]);
      }
    } catch (e) {
      console.error("שגיאה בהבאת האימונים", e);
      setErr("يوجد خلل في جلب البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReport(); }, [loadReport]);
  // const sortedFilteredReports = useMemo(() => {
  //   const q = searchTerm.trim().toLowerCase();

  //   const filtered = q
  //     ? reports.filter(s =>
  //         [s.title, formData(s.date), ["الاحد", "الاثنين", "الثلاثاء","الاربعاء", "الخميس","الجمعة","السبت"][new Date(s.date).getDay()]]
  //           .map(v => String(v ?? "").toLowerCase())
  //           .join(" ")
  //           .includes(q)
  //       )
  //     : reports;

  //   const dirMul = sortDir === "asc" ? 1 : -1;

  //   return [...filtered].sort((a, b) => {
  //     if (sortField === "info") {
  //       const an = String(a.info ?? "");
  //     const bn = String(b.info ?? "");
  //     return an.localeCompare(bn, "he", { sensitivity: "base" }) * dirMul;
  //     }
  //     // name (ברירת מחדל)
  //     const an = String(a.name ?? "");
  //     const bn = String(b.name ?? "");
  //     return an.localeCompare(bn, "he", { sensitivity: "base" }) * dirMul;
  //   });
  // }, [reports, searchTerm, sortField, sortDir]);

  const sortedFilteredReports = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    let filtered = q
      ? reports.filter(r =>
          [
            (r.title ?? []).join(" "),
            r.info,
            formData(r.date),
            dayName(r.date),
          ]
            .map(v => String(v ?? "").toLowerCase())
            .join(" ")
            .includes(q)
        )
      : [...reports];

    // filter: day
    if (filters.day !== "") {
      filtered = filtered.filter(r => {
        const d = toDate(r.date);
        return d ? d.getDay() === Number(filters.day) : false;
      });
    }

    // filter: title text (array)
    if (filters.title.trim()) {
      const t = filters.title.trim().toLowerCase();
      filtered = filtered.filter(r =>
        (r.title ?? []).join(" ").toLowerCase().includes(t)
      );
    }

    // filter: date range
    const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const to = filters.dateTo ? new Date(filters.dateTo) : null;

    if (from) filtered = filtered.filter(r => {
      const d = toDate(r.date);
      return d ? d >= from : false;
    });

    if (to) filtered = filtered.filter(r => {
      const d = toDate(r.date);
      return d ? d <= to : false;
    });

    // sort
    const dirMul = sortDir === "asc" ? 1 : -1;

    filtered.sort((a, b) => {
      if (sortField === "date") {
        return ((toDate(a.date)?.getTime() ?? 0) - (toDate(b.date)?.getTime() ?? 0)) * dirMul;
      }
      if (sortField === "title") {
        return String((a.title ?? []).join(",")).localeCompare(String((b.title ?? []).join(",")), "he", { sensitivity: "base" }) * dirMul;
      }
      if (sortField === "info") {
        return String(a.info ?? "").localeCompare(String(b.info ?? ""), "he", { sensitivity: "base" }) * dirMul;
      }
      return 0;
    });

    return filtered;
  }, [reports, searchTerm, filters, sortField, sortDir]);

  const handleAddReport = async() => {
      navigate("/reports/new");         // נתיב כמו שיש לך היום (תעדכני אם שונה)
  }

  const [infoModal, setInfoModal] = useState({ open: false, title: "", info: "" });

const openInfo = (report) => {
  setInfoModal({
    open: true,
    title: (report.title ?? []).join(", "),
    info: report.info ?? "",
  });
};

const closeInfo = () => setInfoModal({ open: false, title: "", info: "" });

  return (
    <div>
      <div >
        <h1 style={{ textAlign: "center"}}>{localStorage.getItem("roles").includes("الادارة") ? "قائمة التقارير" : "قائمة تقاريري"}</h1>

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

          <button id="page-add-subs"
            style={{ backgroundColor: 'green', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
            onClick={handleAddReport}
          >
            ➕ أضافة تقرير جديد
          </button>

          <button
            style={{ backgroundColor: '#374151', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
            onClick={loadReport}
            disabled={loading}
          >
            {loading ? "جاري التحديث" : "🔄 تحديث القائمة"}
          </button>
        </div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
        مجموع: {sortedFilteredReports && sortedFilteredReports.length > 0 ? sortedFilteredReports.length: 0} التقارير
      </div>
      </div>

      {err && <div style={{ marginTop: 12, color: "#b91c1c" }}>{err}</div>}
      {!err && loading && <div style={{ marginTop: 12 }}>جاري تحديث البيانات</div>}

      {!loading && !err && (
        <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{cursor:'pointer'}} onClick={() => { setSortField("date"); setSortDir(d => d === "asc" ? "desc" : "asc");}}>
                تاريخ  {sortField==="date" ? (sortDir==="asc" ? "▲" : "▼") : ""}</th>
              <th style={{cursor:'pointer'}} onClick={() => { setSortField("date"); setSortDir(d => d === "asc" ? "desc" : "asc");}}>
                يوم  {sortField==="day" ? (sortDir==="asc" ? "▲" : "▼") : ""}</th>
              <th style={{cursor:'pointer'}} onClick={() => { setSortField("date"); setSortDir(d => d === "asc" ? "desc" : "asc");}}>
                اسم التقرير  {sortField==="date" ? (sortDir==="asc" ? "▲" : "▼") : ""}</th>
              <th style={{cursor:'pointer'}} onClick={() => { setSortField("date"); setSortDir(d => d === "asc" ? "desc" : "asc");}}>
                صاحب التقرير  {sortField==="date" ? (sortDir==="asc" ? "▲" : "▼") : ""}</th>  
              <th>للمعلومات</th>
            </tr>
              {/* FILTER ROW */}
            <tr>
              <th>
                <div style={{display:'flex', gap:6}}>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={e=>setFilters(f=>({...f, dateFrom:e.target.value}))}
                    style={{width: "48%"}}
                  />
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={e=>setFilters(f=>({...f, dateTo:e.target.value}))}
                    style={{width: "48%"}}
                  />
                </div>
              </th>

              <th>
                <select
                  value={filters.day}
                  onChange={e=>setFilters(f=>({...f, day:e.target.value}))}
                  style={{width:"100%"}}
                >
                  <option value="">الكل</option>
                  <option value="0">الاحد</option>
                  <option value="1">الاثنين</option>
                  <option value="2">الثلاثاء</option>
                  <option value="3">الاربعاء</option>
                  <option value="4">الخميس</option>
                  <option value="5">الجمعة</option>
                  <option value="6">السبت</option>
                </select>
              </th>

              <th>
                <input
                  placeholder="فلتر العنوان..."
                  value={filters.title}
                  onChange={e=>setFilters(f=>({...f, title:e.target.value}))}
                  style={{width:"100%"}}
                />
              </th>
              <th>
                <input
                  placeholder="فلتر صاحب التقرير..."
                  value={filters.createBy}
                  onChange={e=>setFilters(f=>({...f, createBy:e.target.value}))}
                  style={{width:"100%"}}
                />
              </th>
        
              <th>
                <button
                  onClick={() => setFilters({ day:"", title:"",createBy: "", dateFrom:"", dateTo:"" })}
                  style={{width:"100%"}}
                >
                  Reset
                </button>
              </th>
            </tr>

          </thead>
          <tbody>
            {sortedFilteredReports.length > 0 ? (
              sortedFilteredReports.map((t) => (
                <tr key={t._id}>
                  <td data-label="تاريخ">{formData(t.date)}</td>
                  <td data-label="يوم">{dayName(t.date)}</td>
                  {/* <td data-label="عنوان التقرير">{t.title.join(", ")}</td> */}
                  <td data-label="عنوان التقرير">
                      <div style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-start'}}>
                        {(t.title ?? []).map((tag, i) => (
                          <span key={i} style={{
                            padding:'4px 10px',
                            border:'1px solid #ddd',
                            borderRadius:999,
                            fontSize:12,
                            background:'#f7f7f7'
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                  </td>
                  <td data-label="صاحب التقرير">{t.createdBy}</td>
                  <td data-label="للعملومات">
                    <button style={{ backgroundColor: 'green', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                    onClick={() => navigate(`/reports/${t._id}`)}>اضغط هنا</button>
                    <button style={{ backgroundColor: '#111827', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
                    onClick={() => openInfo(t)}>عرض المعلومات</button>
                    {/* <button style={{ backgroundColor: 'blue', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white', alignItems: "center" }} 
                    onClick={() => generateReportPDF(t.tz)}>تحميل ملف التقرير</button> */}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 16 }}>لا يوجد بيانات لاظهاره</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Fabtn
        anchor="#page-add-subs"                     // או: showFab && canEdit אם תרצה רק כשיש הרשאת עריכה
        visible={showFab}
        label="اضافة تقرير جديد"
        onClick={() => {
          console.log('fab click');           // בדיקת קליק
          navigate(`/reports/new`);
        }}
      />
      {infoModal.open && (
      <div
        onClick={closeInfo}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: 16,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(900px, 95vw)",
            maxHeight: "80vh",
            background: "#fff",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            direction: "rtl",
          }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>تفاصيل التقرير</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{infoModal.title}</div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => navigator.clipboard?.writeText(infoModal.info || "")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      cursor: "pointer",
                    }}
                  >
                    نسخ
                  </button>

                  <button
                    onClick={closeInfo}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#ef4444",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    إغلاق
                  </button>
                </div>
              </div>

              <div style={{ padding: 16, overflow: "auto", maxHeight: "calc(80vh - 60px)" }}>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.7,
                    fontSize: 14,
                    color: "#111827",
                  }}
                >
                  {infoModal.info || "لا يوجد معلومات"}
                </div>
              </div>
            </div>
          </div>
        )}

    </div>
  );
};

export default ViewAllReport;
