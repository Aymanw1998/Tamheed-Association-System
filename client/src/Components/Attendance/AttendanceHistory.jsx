import React, { useEffect, useMemo, useState, useCallback } from "react";
import styles from "./Attendance.module.css";

import { getAllLesson as getLessonsList } from "../../WebServer/services/lesson/functionsLesson";
import {
  getLessonDates,
  getAll, // ✅ existing: GET /attendance?lessonId=&year=&month=&day=
  createAttendanceByList, // ✅ existing: POST /attendance/ByList/:lesson_id/:day/:month/:year
} from "../../WebServer/services/attendance/functionsAttendance";

import { toast } from "../../ALERT/SystemToasts";

const STATUS = [
  { value: "حاضر", label: "حاضر ✅" },
  { value: "غائب", label: "غائب ❌" },
  { value: "متأخر", label: "متأخر ⏰" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => `${pad2(d.day)}/${pad2(d.month)}/${d.year}`;

export default function AttendanceHistory() {
  const [lessons, setLessons] = useState([]);
  const [lessonId, setLessonId] = useState("-1");

  const [dates, setDates] = useState([]); // [{dateKey,day,month,year}]
  const [selectedDateKey, setSelectedDateKey] = useState("");

  const [rows, setRows] = useState([]); // rows from server (populated student maybe)
  const [loading, setLoading] = useState(false);

  const selectedDate = useMemo(
    () => dates.find((d) => String(d.dateKey) === String(selectedDateKey)),
    [dates, selectedDateKey]
  );

  // ✅ load lessons
  useEffect(() => {
    (async () => {
      try {
        const res = await getLessonsList();
        setLessons(res?.ok ? res.lessons : []);
      } catch (e) {
        setLessons([]);
      }
    })();
  }, []);

  // ✅ when lesson selected -> load dates for this lesson
  useEffect(() => {
    if (lessonId == "-1") {
      setDates([]);
      setSelectedDateKey("");
      setRows([]);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const res = await getLessonDates(lessonId);
        console.log("got lesson dates", res);
        if (!res?.ok) throw new Error(res?.message || "خطأ في جلب التواريخ");
        setDates(res.dates || []);
        setSelectedDateKey("");
        setRows([]);
      } catch (e) {
        toast.error("فشل جلب تواريخ الدرس");
        setDates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId]);

  // ✅ when date selected -> load attendances for lesson + date
  useEffect(() => {
    if (lessonId=="-1"  || !selectedDate) {
      setRows([]);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const { year, month, day } = selectedDate;

        // ✅ this calls: GET /attendance?lessonId=&year=&month=&day=
        // and returns attendances with student populated? (in your controller getAttendancesByQuery it does populate)
        const res = await getAll({ lessonId, year, month, day });
        if (!res?.ok) throw new Error(res?.message || "خطأ في جلب الحضور");

        const list = (res.attendances || []).map((a) => ({
          _id: a._id,
          student: typeof a.student === "object" ? a.student : { _id: a.student },
          status: a.status || "حاضر",
          notes: a.notes || "",
        }));

        setRows(list);
      } catch (e) {
        toast.error("فشل جلب الحضور للتاريخ المحدد");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId, selectedDate]);

  const updateRow = useCallback((studentId, patch) => {
    const sid = String(studentId);
    setRows((prev) =>
      prev.map((r) =>
        String(r.student?._id) === sid ? { ...r, ...patch } : r
      )
    );
  }, []);

  const save = async () => {
    if (lessonId == "-1" || !selectedDate) return;

    try {
      setLoading(true);
      const { year, month, day } = selectedDate;

      // السيرفر يتوقع: [{student,status,notes}, ...]
      const payload = rows.map((r) => ({
        student: r.student?._id,
        status: r.status,
        notes: r.notes || "",
      }));

      const res = await createAttendanceByList(lessonId, day, month, year, payload);
      if (!res?.ok) throw new Error(res?.message || "فشل الحفظ");

      toast.success("تم حفظ التعديلات ✅");

      // refresh table with returned result (your controller returns populated)
      const list = (res.attendances || []).map((a) => ({
        _id: a._id,
        student: typeof a.student === "object" ? a.student : { _id: a.student },
        status: a.status || "حاضر",
        notes: a.notes || "",
      }));
      setRows(list);
    } catch (e) {
      toast.error("فشل حفظ التعديلات");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl">
      <h1 style={{ textAlign: "center" }}>سجل الحضور والغياب</h1>

      {/* ✅ Lesson then Date */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          alignItems: "end",
          marginTop: 16,
        }}
      >
        <div>
          <label>اختيار الدرس</label>
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option key={-1} value="-1">-- اختر الدرس --</option>
            <option value={""}>كل الدروس (عام)</option>
            {lessons.map((l) => (
              <option key={l._id} value={l._id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>اختيار التاريخ</label>
          <select
            value={selectedDateKey}
            onChange={(e) => setSelectedDateKey(e.target.value)}
            disabled={lessonId == '-1' || dates.length === 0}
          >
            <option value="">-- اختر التاريخ --</option>
            {dates.map((d) => (
              <option key={d.dateKey} value={d.dateKey}>
                {fmtDate(d)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ opacity: 0.75 }}>
          {selectedDate ? `النتائج: ${rows.length}` : ""}
          {loading ? " — تحميل..." : ""}
        </div>

        <div>
          <button onClick={save} disabled={!rows.length || loading}>
            💾 حفظ التعديلات
          </button>
        </div>
      </div>

      {/* ✅ Editable table */}
      <table className={`table ${styles.subTable}`} style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>الطالب</th>
            <th>الحالة</th>
            <th>ملاحظات</th>
          </tr>
        </thead>

        <tbody>
          {rows.length ? (
            rows.map((r, idx) => (
              <tr key={r._id || idx}>
                <td data-label="#">{idx + 1}</td>

                <td data-label="الطالب">
                  {r.student
                    ? `${r.student.firstname || ""} ${r.student.lastname || ""}`.trim()
                    : "—"}
                </td>

                <td data-label="الحالة">
                  <select
                    value={r.status}
                    onChange={(e) => updateRow(r.student?._id, { status: e.target.value })}
                  >
                    {STATUS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>

                <td data-label="ملاحظات">
                  <textarea
                    value={r.notes}
                    onChange={(e) => updateRow(r.student?._id, { notes: e.target.value })}
                    placeholder="ملاحظة..."
                    style={{ width: "70%" }}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", padding: 16 }}>
                {lessonId && !selectedDateKey
                  ? "اختر تاريخ لعرض السجل"
                  : lessonId && selectedDateKey
                  ? "لا يوجد بيانات لهذا التاريخ"
                  : "اختر درس أولاً"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
