import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAll } from "../../WebServer/services/student/functionsStudent.jsx";
import useLiveRefresh from "../../locks/useLiveRefresh";
import styles from "./Student.module.css";
import Fabtn from "../Global/Fabtn/Fabtn";
import { canStored } from "../../utils/session.js";
import StudentStatusFilter from "./StudentStatusFilter.jsx";
import FilterDialog from "../UI/FilterDialog.jsx";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import CopyParentLink from "./CopyParentLink.jsx";
import MobileStudentList from "./MobileStudentList.jsx";
import Avatar from "../UI/Avatar.jsx";
import { passportSrc } from "../../utils/passportPhoto";

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
  const today = new Date();
  const beforeBirthday = today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
  return today.getFullYear() - date.getFullYear() - Number(beforeBirthday);
};

const ViewAllStudent = () => {
  const navigate = useNavigate();
  const isAdmin = canStored("students.viewAll");
  const canCreateStudents = canStored("students.create");
  // A row opens the student's page, where print, edit and delete are, and
  // approve/reject for a waiting request (owner, 2026-11-02); a click on the
  // name link is left to it.
  const openStudent = (event, student) => {
    if (event.target.closest("a, button")) return;
    navigate(`/students/${student.tz}`);
  };
  const canParentLink = canStored("students.parentLink");

  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [onlyUnsigned, setOnlyUnsigned] = useState(false);
  const [filters, setFilters] = useState({ minAge: "", maxAge: "", layer: "", gender: "", guide: "", school: "" });
  const [showAll, setShowAll] = useState(false);
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

  const ownId = localStorage.getItem("user_id");
  const hasOwn = Boolean(ownId) && students.some((student) => String(student.main_teacher || "") === ownId);
  const scopedStudents = useMemo(() => isAdmin && hasOwn && !showAll
    ? students.filter((student) => String(student.main_teacher || "") === ownId) : students,
  [students, isAdmin, hasOwn, showAll, ownId]);
  const optionsFor = (key) => [...new Set(scopedStudents.map((student) => String(student[key] || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar", { numeric: true }));
  const guideOptions = [...new Map(scopedStudents.filter((student) => student.main_teacher).map((student) => [String(student.main_teacher), student.responsibleGuideName || "مرشد غير فعّال"])).entries()];
  const changeFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const counts = useMemo(() => {
    return scopedStudents.reduce(
      (acc, student) => {
        const key = getStudentFilterKey(student);
        acc[key] += 1;
        if (key === "waiting") acc.pending += 1;
        if (key === "noActive") acc.inactive += 1;
        return acc;
      },
      { active: 0, pending: 0, inactive: 0, waiting: 0, noActive: 0 }
    );
  }, [scopedStudents]);

  const sortedFilteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return scopedStudents
      .filter((student) => {
        return getStudentFilterKey(student) === statusFilter;
      })
      .filter((student) => !onlyUnsigned || !student.consentAt)
      .filter((student) => {
        const age = getAge(student.birth_date);
        return (filters.minAge === "" || (typeof age === "number" && age >= Number(filters.minAge)))
          && (filters.maxAge === "" || (typeof age === "number" && age <= Number(filters.maxAge)))
          && (!filters.layer || String(student.layer || "") === filters.layer)
          && (!filters.gender || String(student.gender || "") === filters.gender)
          && (!filters.school || String(student.school || "") === filters.school)
          && (!filters.guide || (filters.guide === "unassigned" ? !student.main_teacher : String(student.main_teacher) === filters.guide));
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
          student.responsibleGuideName,
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
  }, [scopedStudents, searchTerm, statusFilter, onlyUnsigned, filters]);

  const unsignedCount = useMemo(
    () => scopedStudents.filter((student) => getStudentFilterKey(student) === statusFilter && !student.consentAt).length,
    [scopedStudents, statusFilter]
  );

  const handleAddStudent = () => {
    navigate("/students/new");
  };

  return (
    <div>
      <div>
        <h1 className={styles.pageTitle}>
          {isAdmin && (!hasOwn || showAll) ? "طلاب الجمعية" : "قائمة طلابي"}
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
            <CopyParentLink data-tour="students-parent-link" />
          )}
          {isAdmin && hasOwn && <Button variant="secondary" onClick={() => setShowAll((value) => !value)}>{showAll ? "عرض طلابي" : "عرض طلاب الجمعية"}</Button>}

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
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
          <FilterDialog count={Number(onlyUnsigned) + Object.values(filters).filter((value) => value !== "").length} onClear={() => { setOnlyUnsigned(false); setFilters({ minAge: "", maxAge: "", layer: "", gender: "", guide: "", school: "" }); }}>
            <div className={styles.listFilters}>
            <label>العمر من<input type="number" min="0" max="120" value={filters.minAge} onChange={(event) => changeFilter("minAge", event.target.value)} /></label>
            <label>العمر حتى<input type="number" min="0" max="120" value={filters.maxAge} onChange={(event) => changeFilter("maxAge", event.target.value)} /></label>
            {[ ["layer", "الصف"], ["gender", "الجنس"], ["school", "المدرسة"] ].map(([key, label]) => <label key={key}>{label}<select value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)}><option value="">الكل</option>{optionsFor(key).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
            <label>المرشد المسؤول<select value={filters.guide} onChange={(event) => changeFilter("guide", event.target.value)}><option value="">الكل</option><option value="unassigned">بدون مرشد مسؤول</option>{guideOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={onlyUnsigned} onChange={(event) => setOnlyUnsigned(event.target.checked)} />
              <span>بدون توقيع ولي الأمر فقط</span>
            </label>
            </div>
          </FilterDialog>
          <small style={{ color: "var(--color-text-secondary)" }}>
            متبقٍ توقيع ولي الأمر ({unsignedCount})
          </small>
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
            </tr>
          </thead>
          <tbody>
            {sortedFilteredStudents.length > 0 ? (
              sortedFilteredStudents.map((student) => (
                <tr
                  key={student._id || student.tz}
                  className={styles.openRow}
                  onClick={(e) => openStudent(e, student)}
                >
                  <td data-label="رقم الهوية">{student.tz}</td>
                  <td data-label="اسم الطالب">
                    <span className={styles.nameCell}>
                      <Avatar src={passportSrc(student.photo) || ""} name={`${student.firstname || ""} ${student.lastname || ""}`.trim()} />
                      <Link to={`/students/${student.tz}`} className={styles.nameLink} data-tour="students-open">
                        {`${student.firstname || ""} ${student.lastname || ""}`.trim()}
                      </Link>
                    </span>
                    {!student.consentAt && <small className={styles.signaturePending}>متبقٍ توقيع ولي الأمر</small>}
                  </td>
                  <td data-label="اسم الأب">{student.father_name || "-"}</td>
                  <td data-label="العمر">{getAge(student.birth_date)}</td>
                  <td data-label="الجنس">{student.gender || "-"}</td>
                  <td data-label="الحالة">
                    <StatusBadge tone={STATUS_TONE[getStudentFilterKey(student)]}>
                      {student.status || ACTIVE_STATUS}
                    </StatusBadge>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className={styles.emptyState}>
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
    </div>
  );
};

export default ViewAllStudent;
