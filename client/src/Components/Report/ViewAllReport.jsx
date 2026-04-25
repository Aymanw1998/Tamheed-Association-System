import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAll } from "../../WebServer/services/report/functionsReport.jsx";
import { getAll as getUsers } from "../../WebServer/services/user/functionsUser.jsx";
import styles from "./Report.module.css";
import Fabtn from "../Global/Fabtn/Fabtn.jsx";
import { exportReportPdf } from "./ExportPDF.jsx";

const ADMIN_ROLES = ["ادارة", "إدارة", "الادارة", "الإدارة"];

const normalizeRoles = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (error) {
      return [value];
    }

    return [value];
  }

  return [];
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);

  if (typeof value === "string") {
    const trimmed = value.trim();

    let match = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (match) {
      const [, dd, mm, yyyy] = match.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, yyyy, mm, dd] = match.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) return new Date(timestamp);
  }

  return null;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-GB");
};

const dayName = (value) => {
  const date = toDate(value);
  if (!date) return "";
  return ["الاحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس", "الجمعة", "السبت"][date.getDay()];
};

const resetFilters = {
  day: "",
  stitle: "",
  title: "",
  dateFrom: "",
  dateTo: "",
  createBy: "",
};

const ViewAllReport = () => {
  const navigate = useNavigate();
  const roles = normalizeRoles(localStorage.getItem("roles"));
  const isAdmin = ADMIN_ROLES.some((role) => roles.includes(role));

  const [showFab, setShowFab] = useState(false);
  const [addBtnEl, setAddBtnEl] = useState(null);
  const [reports, setReports] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filters, setFilters] = useState(resetFilters);
  const [infoModal, setInfoModal] = useState({ open: false, title: "", info: "" });

  const addBtnRef = useCallback((node) => {
    setAddBtnEl(node);
  }, []);

  useEffect(() => {
    if (!addBtnEl) {
      setShowFab(false);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFab(!entry.isIntersecting);
      },
      { root: null, threshold: 0.01 }
    );

    observer.observe(addBtnEl);
    return () => observer.disconnect();
  }, [addBtnEl]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const [usersResponse, reportsResponse] = await Promise.all([getUsers(), getAll()]);
      if (!reportsResponse?.ok) throw new Error(reportsResponse?.message || "Load failed");

      const usersById = usersResponse?.ok
        ? Object.fromEntries((usersResponse.users || []).map((user) => [String(user._id), user]))
        : {};

      const enrichedReports = (reportsResponse.reports || []).map((report) => ({
        ...report,
        user: usersById[String(report.createdBy)] || null,
      }));

      setReports(enrichedReports);
    } catch (error) {
      console.error("Failed to load reports", error);
      setErr("يوجد خلل في جلب البيانات");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const sortedFilteredReports = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    let filtered = query
      ? reports.filter((report) =>
          [
            String(report.stitle ?? ""),
            (report.title ?? []).join(" "),
            String(report.info ?? ""),
            formatDate(report.date),
            dayName(report.date),
            report.user ? `${report.user.firstname ?? ""} ${report.user.lastname ?? ""}` : "",
          ]
            .map((value) => String(value ?? "").toLowerCase())
            .join(" ")
            .includes(query)
        )
      : [...reports];

    if (filters.day !== "") {
      filtered = filtered.filter((report) => {
        const date = toDate(report.date);
        return date ? date.getDay() === Number(filters.day) : false;
      });
    }

    if (filters.stitle.trim()) {
      const value = filters.stitle.trim().toLowerCase();
      filtered = filtered.filter((report) => String(report.stitle ?? "").toLowerCase().includes(value));
    }

    if (filters.title.trim()) {
      const value = filters.title.trim().toLowerCase();
      filtered = filtered.filter((report) => (report.title ?? []).join(" ").toLowerCase().includes(value));
    }

    if (filters.createBy.trim()) {
      const value = filters.createBy.trim().toLowerCase();
      filtered = filtered.filter((report) => {
        const owner = report.user ? `${report.user.firstname ?? ""} ${report.user.lastname ?? ""}` : "";
        return owner.toLowerCase().includes(value);
      });
    }

    const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const to = filters.dateTo ? new Date(filters.dateTo) : null;

    if (from) {
      filtered = filtered.filter((report) => {
        const date = toDate(report.date);
        return date ? date >= from : false;
      });
    }

    if (to) {
      filtered = filtered.filter((report) => {
        const date = toDate(report.date);
        return date ? date <= to : false;
      });
    }

    const dirMul = sortDir === "asc" ? 1 : -1;

    filtered.sort((a, b) => {
      if (sortField === "date") {
        return ((toDate(a.date)?.getTime() ?? 0) - (toDate(b.date)?.getTime() ?? 0)) * dirMul;
      }

      if (sortField === "day") {
        return ((toDate(a.date)?.getDay() ?? -1) - (toDate(b.date)?.getDay() ?? -1)) * dirMul;
      }

      if (sortField === "stitle") {
        return String(a.stitle ?? "").localeCompare(String(b.stitle ?? ""), "ar", { sensitivity: "base" }) * dirMul;
      }

      if (sortField === "title") {
        return String((a.title ?? []).join(",")).localeCompare(String((b.title ?? []).join(",")), "ar", {
          sensitivity: "base",
        }) * dirMul;
      }

      if (sortField === "createdBy") {
        const ownerA = a.user ? `${a.user.firstname ?? ""} ${a.user.lastname ?? ""}` : "";
        const ownerB = b.user ? `${b.user.firstname ?? ""} ${b.user.lastname ?? ""}` : "";
        return ownerA.localeCompare(ownerB, "ar", { sensitivity: "base" }) * dirMul;
      }

      return 0;
    });

    return filtered;
  }, [reports, searchTerm, filters, sortField, sortDir]);

  const toggleSort = (field) => {
    setSortField(field);
    setSortDir((current) => (sortField === field ? (current === "asc" ? "desc" : "asc") : "asc"));
  };

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
      <div>
        <h1 style={{ textAlign: "center" }}>{isAdmin ? "قائمة التقارير" : "قائمة تقاريري"}</h1>

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
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <button
            ref={addBtnRef}
            id="page-add-report"
            style={{ backgroundColor: "green", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white" }}
            onClick={() => navigate("/reports/new")}
          >
            اضافة تقرير جديد
          </button>

          <button
            style={{ backgroundColor: "#374151", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white" }}
            onClick={loadReport}
            disabled={loading}
          >
            {loading ? "جاري التحديث" : "تحديث القائمة"}
          </button>
        </div>

        <div style={{ marginTop: 8, opacity: 0.7 }}>
          مجموع: {sortedFilteredReports.length} التقارير
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: "#b91c1c" }}>{err}</div>}
      {!err && loading && <div style={{ marginTop: 12 }}>جاري تحديث البيانات</div>}

      {!loading && !err && (
        <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("date")}>
                تاريخ {sortField === "date" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("day")}>
                يوم {sortField === "day" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("stitle")}>
                اسم التقرير {sortField === "stitle" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("title")}>
                عناوين التقرير {sortField === "title" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th style={{ cursor: "pointer" }} onClick={() => toggleSort("createdBy")}>
                صاحب التقرير {sortField === "createdBy" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th>العمليات</th>
            </tr>

            <tr>
              <th>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                    style={{ width: "48%" }}
                  />
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                    style={{ width: "48%" }}
                  />
                </div>
              </th>

              <th>
                <select
                  value={filters.day}
                  onChange={(event) => setFilters((current) => ({ ...current, day: event.target.value }))}
                  style={{ width: "100%" }}
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
                  placeholder="فلتر اسم..."
                  value={filters.stitle}
                  onChange={(event) => setFilters((current) => ({ ...current, stitle: event.target.value }))}
                  style={{ width: "100%" }}
                />
              </th>

              <th>
                <input
                  placeholder="فلتر العنوان..."
                  value={filters.title}
                  onChange={(event) => setFilters((current) => ({ ...current, title: event.target.value }))}
                  style={{ width: "100%" }}
                />
              </th>

              <th>
                <input
                  placeholder="فلتر صاحب التقرير..."
                  value={filters.createBy}
                  onChange={(event) => setFilters((current) => ({ ...current, createBy: event.target.value }))}
                  style={{ width: "100%" }}
                />
              </th>

              <th>
                <button onClick={() => setFilters(resetFilters)} style={{ width: "100%" }}>
                  Reset
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedFilteredReports.length > 0 ? (
              sortedFilteredReports.map((report) => (
                <tr key={report._id}>
                  <td data-label="تاريخ">{formatDate(report.date)}</td>
                  <td data-label="يوم">{dayName(report.date)}</td>
                  <td data-label="اسم التقرير">{report.stitle}</td>
                  <td data-label="عناوين التقرير">
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-start" }}>
                      {(report.title ?? []).map((tag, index) => (
                        <span
                          key={`${report._id}-title-${index}`}
                          style={{
                            padding: "4px 10px",
                            border: "1px solid #ddd",
                            borderRadius: 999,
                            fontSize: 12,
                            background: "#f7f7f7",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td data-label="صاحب التقرير">
                    {report.user ? `${report.user.firstname ?? ""} ${report.user.lastname ?? ""}` : ""}
                  </td>
                  <td data-label="العمليات">
                    <button
                      style={{ backgroundColor: "yellow", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white" }}
                      onClick={() => navigate(`/reports/${report._id}`)}
                    >
                      للتعديل
                    </button>
                    <button
                      style={{ backgroundColor: "#111827", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white" }}
                      onClick={() => openInfo(report)}
                    >
                      عرض المعلومات
                    </button>
                    <button
                      style={{ backgroundColor: "blue", padding: "0.5rem 1rem", borderRadius: "0.5rem", color: "white" }}
                      onClick={() => exportReportPdf(report, report.user)}
                    >
                      تحميل ملف التقرير
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 16 }}>
                  لا يوجد بيانات لاظهارها
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Fabtn
        anchor="#page-add-report"
        visible={showFab}
        label="اضافة تقرير جديد"
        onClick={() => navigate("/reports/new")}
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
            onClick={(event) => event.stopPropagation()}
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
