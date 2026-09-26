import React, { useEffect, useMemo, useState } from "react";
import styles from "./LessonRoster.module.css";
import Button from "../UI/Button";
import { filterRosterStudents, rosterConflicts, searchStudentsToAdd } from "../../utils/lessonRoster";

const nameOf = (student) => `${student?.firstname || ""} ${student?.lastname || ""}`.trim();
const detailsOf = (student) => [student?.tz, student?.layer].filter(Boolean).join(" · ");

// Students of one lesson. The enrolled list has its own search and scrolls
// after three students; "إضافة طالب" opens a window listing the registered
// students who are not in the lesson yet. Removing offers an undo, and a
// student already in another lesson at the same time gets a warning.
// Changes stay in the form until the lesson is saved.
export default function LessonRoster({ lesson, students, allLessons, canEdit, onChange }) {
  const [rosterQuery, setRosterQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [addedInPicker, setAddedInPicker] = useState(0);
  const [lastRemoved, setLastRemoved] = useState(null);

  const selectedIds = useMemo(() => (lesson.list_students || []).map(String), [lesson.list_students]);
  const byId = useMemo(
    () => Object.fromEntries((students || []).map((student) => [String(student._id), student])),
    [students]
  );
  const enrolled = selectedIds.map((id) => byId[id]).filter(Boolean);
  const shown = filterRosterStudents(enrolled, rosterQuery);
  const conflicts = useMemo(() => rosterConflicts(lesson, allLessons), [lesson, allLessons]);
  const available = useMemo(
    () => (pickerOpen ? searchStudentsToAdd(students, pickerQuery, selectedIds) : []),
    [pickerOpen, students, pickerQuery, selectedIds]
  );

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setPickerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const openPicker = () => {
    setPickerQuery("");
    setAddedInPicker(0);
    setPickerOpen(true);
  };

  const add = (ids) => {
    setLastRemoved(null);
    setAddedInPicker((count) => count + ids.length);
    onChange([...selectedIds, ...ids.map(String)]);
  };

  const remove = (student) => {
    const index = selectedIds.indexOf(String(student._id));
    setLastRemoved({ student, index });
    onChange(selectedIds.filter((id) => id !== String(student._id)));
  };

  const undo = () => {
    if (!lastRemoved) return;
    const next = [...selectedIds];
    next.splice(lastRemoved.index, 0, String(lastRemoved.student._id));
    onChange(next);
    setLastRemoved(null);
  };

  return (
    <div className={styles.roster}>
      <div className={styles.toolbar}>
        <input
          type="search"
          value={rosterQuery}
          onChange={(e) => setRosterQuery(e.target.value)}
          placeholder="ابحث في طلاب الدرس"
          aria-label="ابحث في طلاب الدرس"
        />
        {canEdit && (
          <Button type="button" onClick={openPicker}>
            + إضافة طالب
          </Button>
        )}
      </div>

      {lastRemoved && (
        <div className={styles.undo} role="status">
          <span>تمت إزالة {nameOf(lastRemoved.student)} من الدرس</span>
          <button type="button" onClick={undo}>تراجع</button>
        </div>
      )}

      {enrolled.length === 0 ? (
        <p className={styles.empty}>لا يوجد طلاب في هذا الدرس بعد</p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>لا يوجد طالب مطابق في هذا الدرس</p>
      ) : (
        // Three students visible; the rest scroll.
        <ul className={`${styles.list} ${styles.scrollThree}`}>
          {shown.map((student) => (
            <li key={student._id} className={styles.row}>
              <span className={styles.who}>
                <strong>{nameOf(student)}</strong>
                <small>{detailsOf(student)}</small>
                {conflicts[student._id] && (
                  <span className={styles.conflict}>
                    لديه درس آخر في نفس الوقت: {conflicts[student._id].join("، ")}
                  </span>
                )}
              </span>
              {canEdit && (
                <Button size="sm" variant="danger" onClick={() => remove(student)}>
                  إزالة
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && <p className={styles.hint}>التغييرات تُحفظ عند الضغط على "حفظ البيانات".</p>}

      {pickerOpen && (
        <div className={styles.overlay} onClick={() => setPickerOpen(false)}>
          <div
            className={styles.picker}
            role="dialog"
            aria-modal="true"
            aria-labelledby="roster-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.pickerHeader}>
              <h3 id="roster-picker-title">إضافة طلاب إلى الدرس</h3>
              {addedInPicker > 0 && <span className={styles.addedCount}>أُضيف {addedInPicker}</span>}
            </div>
            <input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="ابحث عن طالب جديد بالاسم أو رقم الهوية"
              aria-label="ابحث عن طالب لإضافته"
              autoFocus
            />
            <small className={styles.pickerCount}>
              {available.length} طالب غير مضاف{pickerQuery.trim() ? " مطابق للبحث" : ""}
            </small>

            {available.length === 0 ? (
              <p className={styles.empty}>لا يوجد طالب غير مضاف{pickerQuery.trim() ? " مطابق للبحث" : ""}</p>
            ) : (
              <ul className={`${styles.list} ${styles.pickerList}`}>
                {available.map((student) => (
                  <li key={student._id} className={styles.row}>
                    <span className={styles.who}>
                      <strong>{nameOf(student)}</strong>
                      <small>{detailsOf(student)}</small>
                    </span>
                    <Button size="sm" variant="success" onClick={() => add([student._id])}>
                      إضافة
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.pickerFooter}>
              {pickerQuery.trim() && available.length > 1 && (
                <Button size="sm" variant="secondary" onClick={() => add(available.map((s) => s._id))}>
                  إضافة كل النتائج ({available.length})
                </Button>
              )}
              <Button type="button" onClick={() => setPickerOpen(false)}>
                تم
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
