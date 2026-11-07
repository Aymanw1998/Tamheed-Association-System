import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAll } from "../../WebServer/services/report/functionsReport.jsx";
import useLiveRefresh from "../../locks/useLiveRefresh";
import { getAll as getUsers } from "../../WebServer/services/user/functionsUser.jsx";
import { getMe } from "../../WebServer/services/auth/fuctionsAuth.jsx";
import styles from "./Report.module.css";
import Fabtn from "../Global/Fabtn/Fabtn.jsx";
import ReportPdfAction from "./ReportPdfAction";
import Button from "../UI/Button.jsx";
import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
import { joinParts } from "../../utils/personCard";
import { canStored } from "../../utils/session";
import FilterDialog from "../UI/FilterDialog.jsx";
import { EMPTY_REPORT_FILTERS, countReportFilters, matchesReportFilters } from "./reportFilters";



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
  return ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][date.getDay()];
};

const ViewAllReport = () => {
  const navigate = useNavigate();
  const isAdmin = canStored("reports.viewAll");
  const canListUsers = canStored("users.view");

  const [showFab, setShowFab] = useState(false);
  const [addBtnEl, setAddBtnEl] = useState(null);
  const [reports, setReports] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filters, setFilters] = useState(EMPTY_REPORT_FILTERS);
  const setFilter = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.value }));

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

  // quiet: a live refresh keeps the list on screen instead of showing the loading state.
  const loadReport = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    if (!quiet) setErr(null);

    try {
      // GET /user/ (the full list) is admin-only. Non-admins only ever see
      // their own reports (server-scoped), so their own profile - fetched
      // through the self-accessible /auth/me - is all "صاحب التقرير" needs.
      const loadOwners = isAdmin && canListUsers
        ? getUsers()
        : getMe().then((user) => ({ ok: Boolean(user), users: user ? [user] : [] }));
      const [usersResponse, reportsResponse] = await Promise.all([loadOwners, getAll()]);
      if (!reportsResponse?.ok) throw new Error(reportsResponse?.message || "Load failed");

      const usersById = usersResponse?.ok
        ? Object.fromEntries((usersResponse.users || []).map((user) => [String(user._id), user]))
        : {};

      const enrichedReports = (reportsResponse.reports || []).map((report) => ({
        ...report,
        // Reports the system account wrote are shown as "النظام".
        user: report.createdBy === "system"
          ? { firstname: "النظام", lastname: "" }
          : usersById[String(report.createdBy)] || null,
      }));

      setReports(enrichedReports);
    } catch (error) {
      console.error("Failed to load reports", error);
      if (quiet) return;
      setErr("تعذّر تحميل البيانات");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);
  useLiveRefresh(["report", "user"], () => loadReport({ quiet: true }));

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

    filtered = filtered.filter((report) => matchesReportFilters(report, filters, toDate));

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
            data-tour="reports-search"
            placeholder="بحث…"
            aria-label="بحث في التقارير"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <Button ref={addBtnRef} id="page-add-report" data-tour="reports-add" onClick={() => navigate("/reports/new")}>
            إضافة تقرير جديد
          </Button>

          <Button variant="secondary" data-tour="reports-refresh" onClick={loadReport} loading={loading}>
            {loading ? "جارٍ التحديث…" : "تحديث القائمة"}
          </Button>
        </div>

        <div style={{ marginTop: 12 }}>
          <FilterDialog count={countReportFilters(filters)} onClear={() => setFilters(EMPTY_REPORT_FILTERS)} tour="reports-filter">
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                من تاريخ
                <input type="date" value={filters.dateFrom} onChange={setFilter("dateFrom")} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                إلى تاريخ
                <input type="date" value={filters.dateTo} onChange={setFilter("dateTo")} />
              </label>
              {/* Others see only their own reports, so a writer filter says nothing to them. */}
              {isAdmin && (
                <label style={{ display: "grid", gap: 4 }}>
                  كاتب التقرير
                  <input value={filters.createBy} onChange={setFilter("createBy")} placeholder="الاسم أو جزء منه" />
                </label>
              )}
              <label style={{ display: "grid", gap: 4 }}>
                عنوان التقرير
                <input value={filters.stitle} onChange={setFilter("stitle")} placeholder="العنوان أو جزء منه" />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                العنوان الثانوي
                <input value={filters.title} onChange={setFilter("title")} placeholder="العنوان أو جزء منه" />
              </label>
            </div>
          </FilterDialog>
        </div>

        <div className={styles.summary}>عدد التقارير: {sortedFilteredReports.length}</div>
      </div>

      {err && <div className={styles.formError}>{err}</div>}
      {!err && loading && <div className={styles.summary}>جارٍ تحديث البيانات…</div>}

      {!loading && !err && (
        <div className={styles.mobileOnly}>
          <PersonCardList emptyText="لا توجد بيانات لعرضها">
            {sortedFilteredReports.map((report) => (
              <PersonCard
                key={report._id}
                initial={toDate(report.date)?.getDate() ?? "؟"}
                name={report.stitle}
                summary={joinParts([dayName(report.date), formatDate(report.date), ownerName(report)])}
                tags={report.title ?? []}
                onOpen={() => navigate(`/reports/${report._id}`)}
                actions={
                  <ReportPdfAction report={report} />
                }
              />
            ))}
          </PersonCardList>
        </div>
      )}

      {!loading && !err && (
        <table data-tour="reports-table" className={`table ${styles.subTable} ${styles.desktopOnly}`} style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th className={styles.sortable} data-tour="reports-sort" onClick={() => toggleSort("date")}>التاريخ{sortMark("date")}</th>
              <th className={styles.sortable} onClick={() => toggleSort("day")}>اليوم{sortMark("day")}</th>
              <th className={styles.sortable} onClick={() => toggleSort("stitle")}>عنوان التقرير{sortMark("stitle")}</th>
              <th className={styles.sortable} onClick={() => toggleSort("title")}>العناوين الثانوية{sortMark("title")}</th>
              <th className={styles.sortable} onClick={() => toggleSort("createdBy")}>كاتب التقرير{sortMark("createdBy")}</th>
              <th>الإجراءات</th>
            </tr>
          </thead>

          <tbody>
            {sortedFilteredReports.length > 0 ? (
              sortedFilteredReports.map((report) => (
                <tr key={report._id}>
                  <td data-label="التاريخ">{formatDate(report.date)}</td>
                  <td data-label="اليوم">{dayName(report.date)}</td>
                  <td data-label="عنوان التقرير">{report.stitle}</td>
                  <td data-label="العناوين الثانوية">
                    <div className={styles.tagList}>
                      {(report.title ?? []).map((tag, index) => (
                        <span key={`${report._id}-title-${index}`} className={styles.tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td data-label="كاتب التقرير">{ownerName(report)}</td>
                  <td data-label="الإجراءات">
                    <div className={styles.rowActions}>
                      <Button size="sm" variant="warning" data-tour="reports-open" onClick={() => navigate(`/reports/${report._id}`)}>
                        تعديل
                      </Button>
                      <ReportPdfAction report={report} tour="reports-pdf" />
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 16 }}>
                  لا توجد بيانات لعرضها
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Fabtn
        anchor="#page-add-report"
        visible={showFab}
        label="إضافة تقرير جديد"
        onClick={() => navigate("/reports/new")}
      />
    </div>
  );
};

export default ViewAllReport;
