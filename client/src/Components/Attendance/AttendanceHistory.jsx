import React, { useEffect, useCallback, useMemo, useState } from "react";
import styles from "./Attendance.module.css"; // نفس css عندك

import { getAttendanceHistory} from "../../WebServer/services/attendance/functionsAttendance"; // عدلي المسار حسب مشروعك

import {getAll as getStudentsList} from "../../WebServer/services/student/functionsStudent"
import {getAllLesson as getLessonsList} from "../../WebServer/services/lesson/functionsLesson"
import AttendanceDonutChart from "./AttendanceDonutChart";

const useDebounce = (value, delay = 400) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);

    return debounced;
}

const STATUS_OPTIONS = [
    { value: "", label: "الكل" },
    { value: "حاضر", label: "حاضر ✅" },
    { value: "غائب", label: "غائب ❌" },
    { value: "متأخر", label: "متأخر ⏰" },
];

function formatDateKeyToYMD(a) {
  // لو عندك day/month/year في الـ attendance
    const d = String(a.day).padStart(2, "0");
    const m = String(a.month).padStart(2, "0");
    const y = String(a.year);
    return `${d}/${m}/${y}`;
    }

export default function AttendanceHistory() {
    const [students, setStudents] = useState([]);
    const [lessons, setLessons] = useState([]);

    const [studentId, setStudentId] = useState("");
    const [lessonId, setLessonId] = useState("");
    const [status, setStatus] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    // ✅ dropdowns
    useEffect(() => {
        (async () => {
        try {
            const [sRes, lRes] = await Promise.all([getStudentsList(), getLessonsList()]);
            setStudents(sRes?.ok ? sRes.students : []);
            setLessons(lRes?.ok ? lRes.lessons : []);
        } catch (e) {
            console.error(e);
            setStudents([]);
            setLessons([]);
        }
        })();
    }, []);

    // ✅ chart data from rows (no extra state)
    const chartData = useMemo(() => {
        const حاضر = rows.filter((a) => a.status === "حاضر").length;
        const غائب = rows.filter((a) => a.status === "غائب").length;
        const متأخر = rows.filter((a) => a.status === "متأخر").length;

        return [
        { name: "حاضر", value: حاضر },
        { name: "غائب", value: غائب },
        { name: "متأخر", value: متأخر },
        ];
    }, [rows]);

    // ✅ Debounced filters for smart search
    const debouncedFilters = useDebounce(
        { studentId, lessonId, status, from, to },
        450
    );

    const handleSearch = useCallback(async (filters) => {
        setLoading(true);
        try {
        const params = {
            studentId: filters.studentId || undefined,
            lessonId: filters.lessonId || undefined,
            status: filters.status || undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
        };

        const res = await getAttendanceHistory(params);
        setRows(res?.ok ? res.attendances : []);
        } catch (e) {
        console.error(e);
        setRows([]);
        } finally {
        setLoading(false);
        }
    }, []);

    // ✅ AUTO SEARCH (smart)
    useEffect(() => {
        handleSearch(debouncedFilters);
    }, [debouncedFilters, handleSearch]);

    const handleReset = () => {
        setStudentId("");
        setLessonId("");
        setStatus("");
        setFrom("");
        setTo("");
        setRows([]);
    };

    return (
        <div>
        <h1 style={{ textAlign: "center" }}>سجل الحضور والغياب</h1>

        <div
            style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            alignItems: "end",
            marginTop: 16,
            }}
        >
            <div>
            <label>فلتر حسب الطالب</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">الكل</option>
                {students.map((s) => (
                <option key={s._id} value={s._id}>
                    {s.firstname} {s.lastname}
                </option>
                ))}
            </select>
            </div>

            <div>
            <label>فلتر حسب الدرس</label>
            <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                <option value="">الكل</option>
                {lessons.map((l) => (
                <option key={l._id} value={l._id}>
                    {l.name}
                </option>
                ))}
            </select>
            </div>

            <div>
            <label>الحالة</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                    {o.label}
                </option>
                ))}
            </select>
            </div>

            <div>
            <label>من تاريخ</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>

            <div>
            <label>إلى تاريخ</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
            <button
                onClick={handleReset}
                disabled={loading}
                style={{ background: "#e5e7eb", borderRadius: 8, padding: "10px 14px" }}
            >
                ↩️ إعادة ضبط
            </button>
            <div style={{ alignSelf: "center", opacity: 0.75 }}>
                {loading ? "جاري البحث..." : `النتائج: ${rows.length}`}
            </div>
            </div>
        </div>

        <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
            <thead>
            <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>الدرس</th>
                <th>الطالب</th>
                <th>الحالة</th>
                <th>ملاحظات</th>
            </tr>
            </thead>

            <tbody>
            {rows && rows.length ? (
                rows.map((r, idx) => (
                <tr key={r._id || idx}>
                    <td data-label="#">{idx + 1}</td>
                    <td data-label="التاريخ">{formatDateKeyToYMD(r)}</td>
                    <td data-label="الدرس">
                    {typeof r.lesson === "object" ? r.lesson?.name : String(r.lesson || "")}
                    </td>
                    <td data-label="الطالب">
                    {typeof r.student === "object"
                        ? `${r.student?.firstname || ""} ${r.student?.lastname || ""}`.trim()
                        : String(r.student || "")}
                    </td>
                    <td data-label="الحالة">{r.status}</td>
                    <td data-label="ملاحظات">{r.notes || ""}</td>
                </tr>
                ))
            ) : (
                <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 16 }}>
                    لا يوجد بيانات
                </td>
                </tr>
            )}
            </tbody>
        </table>

        <div style={{ marginTop: 16 }}>
            <AttendanceDonutChart data={chartData} title="نِسَب الحضور" />
        </div>
        </div>
    );
}
