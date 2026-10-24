import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import MobileLessonList from "../Lesson/MobileLessonList";
import { createLesson, deleteLesson, updateLesson } from "../../WebServer/services/sport/functionsSport";
import { DAY_NAMES, endOf, lessonDayOf, lessonsForDay, startOf, toHHMM } from "../../utils/lessonSchedule";
import { hhmmToMin } from "../../utils/sportSchedule";
import { roomLabel } from "../../utils/rooms";
import grid from "../Lesson/ViewAllLesson.module.css";
import styles from "./Sport.module.css";

const BASE_MIN = 8 * 60; // the grid runs 08:00 to 23:00, like the general schedule
const END_MIN = 23 * 60;
const HOURS = Array.from({ length: 16 }, (_, i) => 8 + i);
const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();
const px = (min) => Math.max(0, Math.min(min - BASE_MIN, END_MIN - BASE_MIN));

function LessonForm({ lesson, players, onClose, onSaved }) {
  const { t } = useI18n();
  const editing = Boolean(lesson);
  const title = t(editing ? "sport.lessons.editTitle" : "sport.lessons.addTitle");
  const [name, setName] = useState(lesson?.name || "");
  const [day, setDay] = useState(lesson?.date?.day || lessonDayOf());
  const [start, setStart] = useState(lesson ? toHHMM(lesson.date.startMin) : "16:00");
  const [end, setEnd] = useState(lesson ? toHHMM(lesson.date.endMin) : "17:00");
  const [ids, setIds] = useState(() => (lesson?.players || []).map((p) => p.studentId));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      name: name.trim(),
      date: { day: Number(day), startMin: hhmmToMin(start), endMin: hhmmToMin(end) },
      studentIds: ids,
    };
    setBusy(true);
    const res = editing ? await updateLesson(lesson._id, payload) : await createLesson(payload);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    toast.success(t("sport.saved"));
    onSaved();
  };

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className={styles.dialog} role="dialog" aria-modal="true" aria-label={title} onSubmit={submit} noValidate>
        <div className={styles.dialogHeader}>
          <h2>{title}</h2>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>{t("sport.close")}</Button>
        </div>
        <div className={styles.fields}>
          <label className={`${styles.field} ${styles.wide}`}>
            {t("sport.lessons.name")}
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className={`${styles.field} ${styles.wide}`}>
            {t("sport.lessons.day")}
            <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            {t("sport.lessons.start")}
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className={styles.field}>
            {t("sport.lessons.end")}
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <fieldset className={`${styles.field} ${styles.wide}`}>
            <legend>{t("sport.lessons.players")} ({ids.length} {t("sport.lessons.selected")})</legend>
            {players.length === 0 ? (
              <div className={styles.muted}>{t("sport.lessons.noPlayers")}</div>
            ) : (
              <div className={`${styles.checks} ${styles.playerChecks}`}>
                {players.map((p) => (
                  <label key={p.studentId} className={styles.check}>
                    <input type="checkbox" checked={ids.includes(p.studentId)} onChange={() => toggle(p.studentId)} />
                    {fullName(p)}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>
        {error && <div className={styles.formError} role="alert">{error}</div>}
        <div className={styles.dialogActions}>
          <Button type="button" variant="secondary" onClick={onClose}>{t("sport.cancel")}</Button>
          <Button type="submit" loading={busy}>{t("sport.save")}</Button>
        </div>
      </form>
    </div>
  );
}

export default function LessonsTab({ lessons, players, canManage, reload }) {
  const { t, dir } = useI18n();
  const [form, setForm] = useState(null); // null | { lesson? }
  const [mobileDay, setMobileDay] = useState(() => lessonDayOf());

  const byId = useMemo(() => new Map(lessons.map((l) => [l._id, l])), [lessons]);
  const openEdit = (lesson) => { if (canManage) setForm({ lesson: byId.get(lesson._id) || lesson }); };

  const remove = async (lesson) => {
    const confirmed = await ask("delete", {
      title: t("sport.lessons.deleteTitle"), message: t("sport.lessons.deleteConfirm"), confirmText: t("sport.lessons.deleteOk"),
    }).catch(() => false);
    if (!confirmed) return;
    const res = await deleteLesson(lesson._id);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.lessons.deleted"));
    reload();
  };

  // MobileLessonList counts students from list_students.
  const mobileLessons = useMemo(
    () => lessons.map((l) => ({ ...l, list_students: (l.players || []).map((p) => p.studentId) })),
    [lessons],
  );

  return (
    <div dir={dir}>
      {canManage && (
        <div className={styles.lessonsBar}>
          <Button onClick={() => setForm({})}>{t("sport.lessons.add")}</Button>
        </div>
      )}
      {lessons.length === 0 && <div className={styles.emptyState}>{t("sport.lessons.empty")}</div>}

      <div className={grid.desktopView}>
        <div className={grid.timelineGrid}>
          <div className={grid.headerSpacer} />
          {DAY_NAMES.map((name) => <div key={name} className={grid.dayHeader}>{name}</div>)}
          <div className={grid.hoursGutter}>
            {HOURS.map((h) => (
              <div key={h}>
                <div className={grid.hourLine} style={{ top: `${20 + h * 60 - BASE_MIN}px` }} />
                <div className={grid.hourLabel} style={{ top: `${20 + h * 60 - BASE_MIN}px` }}>{String(h).padStart(2, "0")}:00</div>
              </div>
            ))}
          </div>
          {DAY_NAMES.map((name, idx) => (
            <div key={name} className={grid.dayCol}>
              {lessonsForDay(lessons, idx + 1).map((l) => (
                <div
                  key={l._id}
                  className={`${grid.lessonBlock} ${styles.lessonButton} ${canManage ? "" : styles.lessonStatic}`}
                  style={{ top: 30 + px(startOf(l)), height: Math.max(10, endOf(l) - startOf(l)) }}
                  role={canManage ? "button" : undefined}
                  tabIndex={canManage ? 0 : undefined}
                  title={`${l.name} · ${toHHMM(startOf(l))}–${toHHMM(endOf(l))}`}
                  onClick={() => openEdit(l)}
                  onKeyDown={(e) => { if (canManage && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEdit(l); } }}
                  draggable={false}
                >
                  <div className={grid.lessonTitle}>{l.name}</div>
                  <div className={grid.lessonMeta}>
                    {toHHMM(startOf(l))}–{toHHMM(endOf(l))} · {(l.players || []).length} {t("sport.lessons.playersCount")}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={grid.mobileView}>
        <MobileLessonList
          lessons={mobileLessons}
          day={mobileDay}
          onDayChange={setMobileDay}
          teacherNames={{}}
          onOpen={canManage ? openEdit : undefined}
        />
      </div>

      {canManage && lessons.length > 0 && (
        <table className={`table ${styles.cards}`} style={{ marginTop: "var(--space-4)" }}>
          <thead>
            <tr>
              <th>{t("sport.lessons.name")}</th>
              <th>{t("sport.lessons.day")}</th>
              <th>{t("sport.lessons.start")}</th>
              <th>{t("sport.lessons.players")}</th>
              <th>{t("sport.players.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {[...lessons].sort((a, b) => a.date.day - b.date.day || startOf(a) - startOf(b)).map((l) => (
              <tr key={l._id}>
                <td data-label={t("sport.lessons.name")}><span className={styles.name}>{l.name}</span></td>
                <td data-label={t("sport.lessons.day")}>{DAY_NAMES[l.date.day - 1]}</td>
                <td data-label={t("sport.lessons.start")}>{toHHMM(startOf(l))}–{toHHMM(endOf(l))} · {roomLabel(l.room)}</td>
                <td data-label={t("sport.lessons.players")}>{(l.players || []).length}</td>
                <td data-label={t("sport.players.actions")}>
                  <div className={styles.rowActions}>
                    <Button size="sm" variant="warning" onClick={() => openEdit(l)}>{t("sport.edit")}</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(l)}>{t("sport.lessons.deleteOk")}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {form && (
        <LessonForm
          lesson={form.lesson}
          players={players}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
        />
      )}
    </div>
  );
}
