// Calendar.jsx (New: Attendance Log by Lesson -> Date -> Edit)
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "../../ALERT/SystemToasts";
import styles from "./Calendar.module.css";

import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson.jsx";
import {
  getLessonDates,
  getAllByLessonDayMonthYear,
  createAttendanceByList,
} from "../../WebServer/services/attendance/functionsAttendance.jsx";

const pad2 = (n) => String(n).padStart(2, "0");
const toDateKeyNum = (y, m, d) => Number(y) * 10000 + Number(m) * 100 + Number(d);

export const Calendar = () => {
  // ✅ lessons
  const [lessons, setLessons] = useState([]);
  const [lessonId, setLessonId] = useState("");

  // ✅ dates for selected lesson
  const [dates, setDates] = useState([]); // [{dateKey, day, month, year}]
  const [selectedDateKey, setSelectedDateKey] = useState("");

  // ✅ attendance rows (populated student)
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const selectedLesson = useMemo(
    () => lessons.find((l) => String(l._id) === String(lessonId)),
    [lessons, lessonId]
  );

  const selectedDateObj = useMemo(
    () => dates.find((d) => String(d.dateKey) === String(selectedDateKey)),
    [dates, selectedDateKey]
  );

  const dateLabel = (d) => `${pad2(d.day)}/${pad2(d.month)}/${d.year}`;

  // 1) load lessons once
  useEffect(() => {
    (async () => {
      try {
        const res = await getAllLesson();
        if (!res?.ok) throw new Error(res?.message || "خطأ في جلب الدروس");
        setLessons(res.lessons || []);
      } catch (e) {
        toast.error("فشل جلب الدروس");
      }
    })();
  }, []);

  // 2) when lesson changes -> load its dates
  useEffect(() => {
    if (!lessonId) {
      setDates([]);
      setSelectedDateKey("");
      setRows([]);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const res = await getLessonDates(lessonId);
        if (!res?.ok) throw new Error(res?.message || "خطأ في جلب التواريخ");
        setDates(res.dates || []);
        setSelectedDateKey("");
        setRows([]);
      } catch (e) {
        toast.error("فشل جلب تواريخ الدرس");
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId]);

  // 3) when date changes -> load attendances for that lesson+date
  useEffect(() => {
    if (!lessonId || !selectedDateObj) {
      setRows([]);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const { day, month, year } = selectedDateObj;

        const res = await getAllByLessonDayMonthYear(lessonId, day, month, year);
        if (!res?.ok) throw new Error(res?.message || "خطأ في جلب الحضور");

        const list = (res.attendances || []).map((a) => ({
          ...a,
          status: a.status || "حاضر",
          notes: a.notes || "",
          studentId: a.student?._id || a.student,
          studentName: a.student
            ? `${a.student.firstname || ""} ${a.student.lastname || ""}`.trim()
            : "",
          studentTz: a.student?.tz || "",
        }));

        setRows(list);
      } catch (e) {
        toast.error("فشل جلب الحضور للتاريخ");
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId, selectedDateObj]);

  const updateRow = (rowId, patch) => {
    setRows((prev) =>
      prev.map((r) => (String(r._id) === String(rowId) ? { ...r, ...patch } : r))
    );
  };

  const save = async () => {
    if (!lessonId || !selectedDateObj) return;

    try {
      setLoading(true);
      const { day, month, year } = selectedDateObj;

      // server expects: [{student,status,notes}, ...]
      const payload = rows.map((r) => ({
        student: r.studentId,
        status: r.status, // "حاضر" | "غائب" | "متأخر"
        notes: r.notes || "",
      }));

      const res = await createAttendanceByList(lessonId, day, month, year, payload);
      if (!res?.ok) throw new Error(res?.message || "خطأ في الحفظ");

      toast.success("تم حفظ التعديلات ✅");
      // refresh with returned attendances (already populated in controller)
      const list = (res.attendances || []).map((a) => ({
        ...a,
        status: a.status || "حاضر",
        notes: a.notes || "",
        studentId: a.student?._id || a.student,
        studentName: a.student
          ? `${a.student.firstname || ""} ${a.student.lastname || ""}`.trim()
          : "",
        studentTz: a.student?.tz || "",
      }));
      setRows(list);
    } catch (e) {
      toast.error("فشل حفظ التعديلات");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.calendar} dir="rtl">
      <div style={{ padding: 12 }}>
        <h2 className={styles.popupTitle}>سجل الحضور والغياب</h2>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "gray" }}>اختيار الدرس</label>
            <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">-- اختر الدرس --</option>
              {lessons.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "gray" }}>اختيار التاريخ</label>
            <select
              value={selectedDateKey}
              onChange={(e) => setSelectedDateKey(e.target.value)}
              disabled={!lessonId || dates.length === 0}
            >
              <option value="">-- اختر التاريخ --</option>
              {dates.map((d) => (
                <option key={d.dateKey} value={d.dateKey}>
                  {dateLabel(d)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginInlineStart: "auto", color: "gray" }}>
            {selectedLesson && lessonId ? (
              <span>الدرس: {selectedLesson?.name || ""}</span>
            ) : null}
            {selectedDateObj ? <span> | التاريخ: {dateLabel(selectedDateObj)}</span> : null}
            {selectedDateObj ? <span> | النتائج: {rows.length}</span> : null}
          </div>
        </div>

        {loading && <div style={{ marginTop: 12, color: "gray" }}>تحميل...</div>}

        {/* Table */}
        {selectedDateObj && !loading && (
          <>
            <table className={styles.attTable} style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>رقم الهوية</th>
                  <th>اسم الطالب</th>
                  <th>الحالة</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r._id || `${r.studentId}-${i}`}>
                    <td>{i + 1}</td>
                    <td>{r.studentTz || "-"}</td>
                    <td>{r.studentName || "-"}</td>
                    <td>
                      <select
                        value={r.status}
                        onChange={(e) => updateRow(r._id, { status: e.target.value })}
                      >
                        <option value="حاضر">حاضر</option>
                        <option value="غائب">غائب</option>
                        <option value="متأخر">متأخر</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="ملاحظات"
                        value={r.notes || ""}
                        onChange={(e) => updateRow(r._id, { notes: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              className={styles.addButton}
              style={{ marginTop: 12 }}
              onClick={save}
              disabled={loading}
            >
              حفظ التعديلات
            </button>
          </>
        )}

        {!selectedDateObj && lessonId && dates.length === 0 && !loading && (
          <div style={{ marginTop: 16, color: "gray" }}>
            لا يوجد تواريخ حضور لهذا الدرس بعد.
          </div>
        )}
      </div>
    </div>
  );
};
