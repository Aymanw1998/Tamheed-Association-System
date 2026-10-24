import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import { dropQueuedSheet, isOffline, noResponse, queueAttendance } from "../../pwa/queuedSave";
import { OVERWRITTEN_MESSAGE, SAVED_OFFLINE_MESSAGE } from "../../pwa/attendanceQueue";
import { getAttendance, getTodayLessons, saveAttendance } from "../../WebServer/services/sport/functionsSport";
import { DAY_NAMES, endOf, startOf, toHHMM } from "../../utils/lessonSchedule";
import { lessonDates } from "../../utils/sportSchedule";
import styles from "./Sport.module.css";

const STATUSES = [
  { value: "حاضر", key: "present", cls: "pillPresent" },
  { value: "غائب", key: "absent", cls: "pillAbsent" },
  { value: "متأخر", key: "late", cls: "pillLate" },
];
const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();
const dateLabel = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
};

// Takes attendance for a football lesson: opens on today's first lesson, and
// any lesson can be reopened on an earlier date of its weekday.
export default function AttendanceTab({ lessons, canCoach }) {
  const { t, dir } = useI18n();
  const [today, setToday] = useState("");
  const [todayLessons, setTodayLessons] = useState(null); // null while loading
  const [lessonId, setLessonId] = useState("");
  const [date, setDate] = useState("");
  const [sheet, setSheet] = useState(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const lesson = useMemo(() => lessons.find((l) => l._id === lessonId) || null, [lessons, lessonId]);
  const dates = useMemo(() => (lesson && today ? lessonDates(lesson.date.day, today, 26) : []), [lesson, today]);

  // Today's lessons decide which lesson opens first.
  useEffect(() => {
    let live = true;
    (async () => {
      const res = await getTodayLessons();
      if (!live) return;
      if (!res.ok) { setError(res.message); setTodayLessons([]); return; }
      const list = [...(res.lessons || [])].sort((a, b) => startOf(a) - startOf(b));
      setToday(res.date);
      setTodayLessons(list);
      if (list.length) { setLessonId(list[0]._id); setDate(res.date); }
    })();
    return () => { live = false; };
  }, []);

  const loadSheet = useCallback(async (id, ymd) => {
    setLoadingSheet(true);
    setError("");
    const res = await getAttendance(id, ymd);
    setLoadingSheet(false);
    if (!res.ok) { setSheet(null); setError(res.message); return; }
    setSheet(res.players || []);
    setDirty(false);
  }, []);

  useEffect(() => {
    if (lessonId && date) loadSheet(lessonId, date);
    else setSheet(null);
  }, [lessonId, date, loadSheet]);

  const confirmLeave = async () => !dirty || (await ask("navigate").catch(() => false));

  const pickLesson = async (id) => {
    if (id === lessonId || !(await confirmLeave())) return;
    const next = lessons.find((l) => l._id === id);
    setLessonId(id);
    setDate(next && today ? lessonDates(next.date.day, today, 1)[0] || "" : "");
  };

  const pickDate = async (ymd) => {
    if (ymd === date || !(await confirmLeave())) return;
    setDate(ymd);
  };

  const mark = (studentId, status) => {
    setSheet((rows) => rows.map((p) => (p.studentId === studentId ? { ...p, status } : p)));
    setDirty(true);
  };
  const markAll = (status) => { setSheet((rows) => rows.map((p) => ({ ...p, status }))); setDirty(true); };

  const save = async () => {
    const marks = sheet.filter((p) => p.status).map((p) => ({ studentId: p.studentId, status: p.status }));
    if (!marks.length) return toast.warn(t("sport.attendance.nothingToSave"));
    setSaving(true);
    const queued = {
      kind: "sport",
      url: `/sports/lessons/${encodeURIComponent(lessonId)}/attendance`,
      body: { date, marks },
      label: lesson?.name || "حضور",
    };
    const res = isOffline() ? { ok: false, status: 0 } : await saveAttendance(lessonId, date, marks);
    if (!res.ok && (isOffline() || noResponse(res))) {
      // No connection: keep the save on this device and send it later.
      const kept = await queueAttendance(queued);
      if (kept) {
        setSaving(false);
        setDirty(false);
        return toast.success(SAVED_OFFLINE_MESSAGE);
      }
    }
    setSaving(false);
    if (!res.ok) return toast.warn(res.message);
    await dropQueuedSheet(queued);
    setDirty(false);
    toast.success(t("sport.attendance.saved"));
    if (res.overwritten?.length) toast.warn(OVERWRITTEN_MESSAGE);
  };

  if (todayLessons === null) return <div className={styles.emptyState}>{t("sport.loading")}</div>;

  const count = (status) => (sheet || []).filter((p) => p.status === status).length;

  return (
    <div dir={dir}>
      {todayLessons.length === 0 && <div className={styles.notice}>{t("sport.attendance.noToday")}</div>}
      {lessons.length === 0 && <div className={styles.emptyState}>{t("sport.attendance.noLessons")}</div>}

      {lessons.length > 0 && (
        <div className={styles.attBar}>
          <label className={styles.field}>
            {t("sport.attendance.lesson")}
            <select value={lessonId} onChange={(e) => pickLesson(e.target.value)}>
              <option value="" disabled>{t("sport.attendance.pickLesson")}</option>
              {lessons.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name} · {DAY_NAMES[l.date.day - 1]} {toHHMM(startOf(l))}–{toHHMM(endOf(l))}
                </option>
              ))}
            </select>
          </label>
          {lesson && (
            <label className={styles.field}>
              {t("sport.attendance.date")}
              <select value={date} onChange={(e) => pickDate(e.target.value)}>
                {dates.map((d) => <option key={d} value={d}>{dateLabel(d)}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {error && <div className={styles.formError} role="alert">{error}</div>}
      {loadingSheet && <div className={styles.emptyState}>{t("sport.attendance.loading")}</div>}

      {sheet && !loadingSheet && (
        <>
          {!canCoach && <div className={styles.notice}>{t("sport.attendance.readOnly")}</div>}
          {sheet.length === 0 ? (
            <div className={styles.emptyState}>{t("sport.attendance.noPlayers")}</div>
          ) : (
            <>
              {canCoach && (
                <div className={styles.quick}>
                  <Button size="sm" variant="secondary" onClick={() => markAll("حاضر")}>{t("sport.attendance.allPresent")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => markAll("متأخر")}>{t("sport.attendance.allLate")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => markAll("غائب")}>{t("sport.attendance.allAbsent")}</Button>
                </div>
              )}
              <div className={styles.tableWrap}>
                <table className={`table ${styles.cards}`}>
                  <thead>
                    <tr><th>{t("sport.attendance.player")}</th><th>{t("sport.attendance.status")}</th></tr>
                  </thead>
                  <tbody>
                    {sheet.map((p) => (
                      <tr key={p.studentId}>
                        <td data-label={t("sport.attendance.player")}><span className={styles.name}>{fullName(p)}</span></td>
                        <td data-label={t("sport.attendance.status")}>
                          <div className={styles.pills}>
                            {STATUSES.map((s) => (
                              <button
                                key={s.value}
                                type="button"
                                className={`${styles.pill} ${styles[s.cls]}`}
                                aria-pressed={p.status === s.value}
                                disabled={!canCoach}
                                onClick={() => mark(p.studentId, s.value)}
                              >
                                {t(`sport.attendance.${s.key}`)}
                              </button>
                            ))}
                            {!p.status && <span className={styles.muted}>{t("sport.attendance.unmarked")}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.attFooter}>
                <div className={styles.attCounts}>
                  {t("sport.attendance.present")}: {count("حاضر")} • {t("sport.attendance.late")}: {count("متأخر")} • {t("sport.attendance.absent")}: {count("غائب")}
                  {dirty && <> • {t("sport.attendance.unsaved")}</>}
                </div>
                {canCoach && <Button onClick={save} loading={saving} disabled={!dirty}>{t("sport.attendance.save")}</Button>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
