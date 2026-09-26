import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAll } from "../../WebServer/services/report/functionsReport.jsx";
import { getAll as getUsers } from "../../WebServer/services/user/functionsUser.jsx";
import { getMe } from "../../WebServer/services/auth/fuctionsAuth.jsx";
import styles from "./Report.module.css";
import Fabtn from "../Global/Fabtn/Fabtn.jsx";
import { exportReportPdf } from "./ExportPDF.jsx";
import Button from "../UI/Button.jsx";
import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
import { joinParts } from "../../utils/personCard";

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
  const datePart = date.toLocaleDateString("en-GB");
  const timePart = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} ${timePart}`;
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
      // GET /user/ (the full list) is admin-only. Non-admins only ever see
      // their own reports (server-scoped), so their own profile - fetched
      // through the self-accessible /auth/me - is all "صاحب التقرير" needs.
      const loadOwners = isAdmin
        ? getUsers()
        : getMe().then((user) => ({ ok: Boolean(user), users: user ? [user] : [] }));
      const [usersResponse, reportsResponse] = await Promise.all([loadOwners, getAll()]);
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
  }, [isAdmin]);

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

  const ownerName = (report) =>
    report.user ? `${report.user.firstname ?? ""} ${report.user.lastname ?? ""}`.trim() : "";

  const sortMark = (field) => (sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div>
      <div>
        <h1 className={styles.pageTitle}>{isAdmin ? "قائمة التقارير" : "قائمة تقاريري"}</h1>

        <div className={styles.toolbar}>
          <input
            type="search"
            placeholder="بحث..."
            aria-label="بحث في التقارير"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <Button ref={addBtnRef} id="page-add-report" onClick={() => navigate("/reports/new")}>
            اضافة تقرير جديد
          </Button>

          <Button variant="secondary" onClick={loadReport} loading={loading}>
            {loading ? "جاري التحديث" : "تحديث القائمة"}
          </Button>
        </div>

        <div className={styles.summary}>مجموع: {sortedFilteredReports.length} تقارير</div>
      </div>

      {err && <div className={styles.formError}>{err}</div>}
      {!err && loading && <div className={styles.summary}>جاري تحديث البيانات</div>}

      {!loading && !err && (
        <div className={styles.mobileOnly}>
          <PersonCardList emptyText="لا يوجد بيانات لاظهارها">
            {sortedFilteredReports.map((report) => (
              <PersonCard
                key={report._id}
                initial={toDate(report.date)?.getDate() ?? "؟"}
                name={report.stitle}
                summary={joinParts([dayName(report.date), formatDate(report.date), ownerName(report)])}
                tags={report.title ?? []}
                onOpen={() => navigate(`/reports/${report._id}`)}
                actions={
                  <Button size="sm" variant="secondary" onClick={() => exportReportPdf(report, report.user)}>
                    ملف التقرير
                  </Button>
                }
              />
            ))}
          </PersonCardList>
        </div>
      )}

      {!loading && !err && (
        <table className={`table ${styles.subTable} ${styles.desktopOnly}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th className={styles.sortable} onClick={() => toggleSort("date")}>تاريخ{sortMark("date")}</th>
              <th className={styles.sortable} onClick={() => toggleSort("day")}>يوم{sortMark("day")}</th>
              <th className={styles.sortable} onClick={() => toggleSort("stitle")}>اسم التقرير{sortMark("stitle")}</th>
              <th className={styles.sortable} onClick={() => toggleSort("title")}>عناوين التقرير{sortMark("title")}</th>
              <th className={styles.sortable} onClick={() => toggleSort("createdBy")}>صاحب التقرير{sortMark("createdBy")}</th>
              <th>العمليات</th>
            </tr>

            <tr>
              <th>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="date"
                    aria-label="من تاريخ"
                    value={filters.dateFrom}
                    onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                    style={{ width: "48%" }}
                  />
                  <input
                    type="date"
                    aria-label="إلى تاريخ"
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
                <Button size="sm" variant="secondary" onClick={() => setFilters(resetFilters)}>
                  مسح الفلاتر
                </Button>
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
                    <div className={styles.tagList}>
                      {(report.title ?? []).map((tag, index) => (
                        <span key={`${report._id}-title-${index}`} className={styles.tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td data-label="صاحب التقرير">{ownerName(report)}</td>
                  <td data-label="العمليات">
                    <div className={styles.rowActions}>
                      <Button size="sm" variant="warning" onClick={() => navigate(`/reports/${report._id}`)}>
                        للتعديل
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => exportReportPdf(report, report.user)}>
                        ملف التقرير
                      </Button>
                    </div>
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
    </div>
  );
};

export default ViewAllReport;
