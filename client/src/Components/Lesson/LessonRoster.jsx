import React, { useEffect, useMemo, useState } from "react";
import styles from "./LessonRoster.module.css";
import Button from "../UI/Button";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { lookupStudent } from "../../WebServer/services/student/functionsStudent";
import {
  filterRosterStudents,
  isFullTz,
  rosterConflicts,
  rosterSummary,
  searchStudentsToAdd,
} from "../../utils/lessonRoster";

const nameOf = (student) => `${student?.firstname || ""} ${student?.lastname || ""}`.trim();
const detailsOf = (student) => [student?.tz, student?.layer].filter(Boolean).join(" · ");

// Students of one lesson. The enrolled list has its own search and scrolls
// after three students; "إضافة طالب" opens a window listing the registered
// students who are not in the lesson yet. Removing offers an undo, and a
// student already in another lesson at the same time gets a warning.
// Changes stay in the form until the lesson is saved.
// hiddenCount: students the server hid from this viewer (shown only as a number).
// pending: students found by ID number on a lesson not saved yet.
// onLookupAdd(student) adds a found student; it resolves true when they joined.
export default function LessonRoster({
  lesson,
  students,
  allLessons,
  canEdit,
  onChange,
  hiddenCount = 0,
  pending = [],
  onLookupAdd,
  onRemovePending,
}) {
  const { t } = useI18n();
  const [lookupTz, setLookupTz] = useState("");
  const [lookupMsg, setLookupMsg] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [found, setFound] = useState(null);
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

  const { others } = rosterSummary({ visible: enrolled.length, hiddenCount });

  const runLookup = async () => {
    const tz = lookupTz.trim();
    setFound(null);
    if (!isFullTz(tz)) { setLookupMsg(t("roster.lookupInvalid")); return; }
    setLookupBusy(true);
    setLookupMsg("");
    const res = await lookupStudent(tz);
    setLookupBusy(false);
    if (!res.ok) { setLookupMsg(res.notFound ? t("roster.lookupNotFound") : t("roster.lookupFailed")); return; }
    const id = String(res.student._id);
    if (selectedIds.includes(id) || pending.some((p) => String(p._id) === id)) {
      setLookupMsg(t("roster.alreadyIn"));
      return;
    }
    setFound(res.student);
  };

  const addFound = async () => {
    if (!found || !onLookupAdd) return;
    setLookupBusy(true);
    const joined = await onLookupAdd(found);
    setLookupBusy(false);
    if (joined) {
      toast.success(t("roster.added"));
      setAddedInPicker((count) => count + 1);
      setFound(null);
      setLookupTz("");
      setLookupMsg("");
    } else {
      toast.warn(t("roster.notAdded"));
    }
  };

  const openPicker = () => {
    setLookupTz("");
    setLookupMsg("");
    setFound(null);
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
          data-tour="roster-search"
          placeholder="ابحث في طلاب الدرس"
          aria-label="ابحث في طلاب الدرس"
        />
        {canEdit && (
          <Button type="button" data-tour="roster-add" onClick={openPicker}>
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
        <ul className={`${styles.list} ${styles.scrollThree}`} data-tour="roster-list">
          {shown.map((student) => (
            <li key={student._id} className={styles.row}>
              <span className={styles.who}>
                <strong>{nameOf(student)}</strong>
                <small>{detailsOf(student)}</small>
                {conflicts[student._id] && (
                  <span className={styles.conflict}>
                    لديه درس آخر في الوقت نفسه: {conflicts[student._id].join("، ")}
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

      {others > 0 && (
        <p className={styles.hint} role="status">{t("roster.others").replace("{n}", String(others))}</p>
      )}

      {pending.length > 0 && (
        <div>
          <small className={styles.hint}>{t("roster.pendingTitle")}</small>
          <ul className={styles.list}>
            {pending.map((student) => (
              <li key={student._id} className={styles.row}>
                <span className={styles.who}>
                  <strong>{nameOf(student)}</strong>
                  <small>{student.tz}</small>
                </span>
                {canEdit && (
                  <Button size="sm" variant="danger" onClick={() => onRemovePending && onRemovePending(student)}>
                    {t("roster.pendingRemove")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && <p className={styles.hint}>لا تُحفظ التغييرات إلا بعد الضغط على زر الحفظ.</p>}

      {pickerOpen && (
        <div className={styles.overlay} onClick={() => setPickerOpen(false)}>
          <div
            className={styles.picker}
            data-tour="roster-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="roster-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.pickerHeader}>
              <h3 id="roster-picker-title">إضافة طلاب إلى الدرس</h3>
              {addedInPicker > 0 && <span className={styles.addedCount}>أُضيف: {addedInPicker}</span>}
            </div>
            <input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="ابحث عن طالب جديد بالاسم أو رقم الهوية"
              aria-label="ابحث عن طالب لإضافته"
              autoFocus
            />
            {onLookupAdd && (
              <div className={styles.lookup}>
                <strong>{t("roster.lookupTitle")}</strong>
                <small>{t("roster.lookupHint")}</small>
                <div className={styles.toolbar}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={lookupTz}
                    onChange={(e) => { setLookupTz(e.target.value); setFound(null); setLookupMsg(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runLookup(); } }}
                    placeholder={t("roster.lookupPlaceholder")}
                    aria-label={t("roster.lookupTitle")}
                  />
                  <Button type="button" size="sm" disabled={lookupBusy} onClick={runLookup}>
                    {t("roster.lookupButton")}
                  </Button>
                </div>
                {lookupMsg && <span className={styles.conflict} role="alert">{lookupMsg}</span>}
                {found && (
                  <div className={styles.row}>
                    <span className={styles.who}>
                      <strong>{nameOf(found)}</strong>
                      <small>{found.tz}</small>
                    </span>
                    <Button size="sm" variant="success" disabled={lookupBusy} onClick={addFound}>
                      {t("roster.lookupAdd")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <small className={styles.pickerCount}>
              طلاب غير مضافين{pickerQuery.trim() ? " يطابقون البحث" : ""}: {available.length}
            </small>

            {available.length === 0 ? (
              <p className={styles.empty}>لا يوجد طلاب غير مضافين{pickerQuery.trim() ? " يطابقون البحث" : ""}</p>
            ) : (
              <ul className={`${styles.list} ${styles.pickerList}`}>
                {available.map((student, index) => (
                  <li key={student._id} className={styles.row}>
                    <span className={styles.who}>
                      <strong>{nameOf(student)}</strong>
                      <small>{detailsOf(student)}</small>
                    </span>
                    <Button size="sm" variant="success" data-tour={index === 0 ? "roster-picker-add" : undefined} onClick={() => add([student._id])}>
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
              <Button type="button" data-tour="roster-picker-done" onClick={() => setPickerOpen(false)}>
                تم
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
