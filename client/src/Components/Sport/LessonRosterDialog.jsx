import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import { addLessonPlayer, removeLessonPlayer } from "../../WebServer/services/sport/functionsSport";
import StudentPicker from "./StudentPicker";
import styles from "./Sport.module.css";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();

// The players of one lesson. Any student can be added: someone who is not yet
// a football player becomes one automatically (no number, no position).
export default function LessonRosterDialog({ lesson, canEdit, onClose, reload }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const players = lesson?.players || [];

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!lesson) return null;

  const add = async (student) => {
    setBusy(true);
    const res = await addLessonPlayer(lesson._id, student._id);
    setBusy(false);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.lessons.added"));
    setAdding(false);
    reload();
  };

  const remove = async (player) => {
    const confirmed = await ask("delete", {
      title: t("sport.lessons.removePlayer"), message: t("sport.lessons.removeConfirm"), confirmText: t("sport.lessons.removePlayer"),
    }).catch(() => false);
    if (!confirmed) return;
    setBusy(true);
    const res = await removeLessonPlayer(lesson._id, player.studentId);
    setBusy(false);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.lessons.rosterRemoved"));
    reload();
  };

  const title = adding ? t("sport.lessons.addStudentTitle") : `${t("sport.lessons.rosterTitle")}: ${lesson.name}`;
  const inLesson = new Set(players.map((p) => p.studentId));

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.dialogHeader}>
          <h2>{title}</h2>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label={t("sport.close")}>✕</Button>
        </div>

        {adding ? (
          <>
            <StudentPicker
              pickLabel={t("sport.dialog.pick")}
              isDisabled={(s) => (inLesson.has(s._id) ? t("sport.lessons.alreadyInLesson") : "")}
              onPick={add}
            />
            <div className={styles.dialogActions}>
              <Button variant="secondary" disabled={busy} onClick={() => setAdding(false)}>{t("sport.lessons.back")}</Button>
            </div>
          </>
        ) : (
          <>
            {canEdit && (
              <div className={styles.lessonsBar}>
                <Button onClick={() => setAdding(true)}>{t("sport.lessons.addStudent")}</Button>
              </div>
            )}
            {players.length === 0 && <div className={styles.emptyState}>{t("sport.lessons.rosterEmpty")}</div>}
            <ul className={styles.rosterList}>
              {players.map((p) => (
                <li key={p.studentId} className={styles.result}>
                  <span className={styles.name}>{fullName(p)}</span>
                  {canEdit && <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(p)}>{t("sport.lessons.removePlayer")}</Button>}
                </li>
              ))}
            </ul>
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={onClose}>{t("sport.close")}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
