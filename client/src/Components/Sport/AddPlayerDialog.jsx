import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import { savePlayer } from "../../WebServer/services/sport/functionsSport";
import { validateJersey } from "./sportForm";
import StudentPicker from "./StudentPicker";
import styles from "./Sport.module.css";
import useItemLock from "../../locks/useItemLock";
import LockedScreen from "../../locks/LockedScreen";
import ReadOnlyArea from "../../locks/ReadOnlyArea";
import SaveNotice from "../../locks/SaveNotice";
import forceRelease from "../../locks/forceRelease";
import { handleSaveError } from "../../locks/staleSave";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();

// Adds a student as a player, or (with `player`) edits an existing player.
// The full lessonIds list is always sent: leaving it out would remove the
// player from every lesson.
export default function AddPlayerDialog({ lessons, player, onClose, onSaved }) {
  const { t } = useI18n();
  const editing = Boolean(player);
  const [picked, setPicked] = useState(editing ? { _id: player.studentId, name: fullName(player) } : null);
  const [jersey, setJersey] = useState(editing ? (player.jerseyNumber ?? "") : "");
  const [position, setPosition] = useState(editing ? (player.position || "") : "");
  const [lessonIds, setLessonIds] = useState(editing ? (player.lessons || []).map((l) => l._id) : []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  // Editing an existing player locks him; adding a new one has nothing to lock yet.
  const lockKey = editing ? `player:${player.studentId}` : null;
  const lock = useItemLock(lockKey);
  const readonly = lock.status === "readonly";
  const title = t(editing ? "sport.players.editTitle" : "sport.dialog.title");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleLesson = (id) =>
    setLessonIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = async (event) => {
    event.preventDefault();
    if (!picked) return setError(t("sport.validation.studentRequired"));
    const jerseyError = validateJersey(jersey);
    if (jerseyError) return setError(jerseyError);
    setBusy(true);
    const res = await savePlayer(picked._id, {
      jerseyNumber: String(jersey).trim() === "" ? null : Number(jersey),
      position: position.trim(),
      lessonIds,
    });
    setBusy(false);
    if (!res.ok) {
      if (handleSaveError(res, { draft: position, setNotice })) return;
      return setError(res.message);
    }
    toast.success(t("sport.saved"));
    onSaved();
  };

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className={styles.dialog} role="dialog" aria-modal="true" aria-label={title} onSubmit={submit} noValidate>
        <div className={styles.dialogHeader}>
          <h2>{title}</h2>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label={t("sport.close")}>✕</Button>
        </div>

        {lock.status === "blocked" ? (
          <LockedScreen holder={lock.holder} onForceRelease={forceRelease(lockKey)} />
        ) : (
        <ReadOnlyArea readonly={readonly}>
        {!picked && (
          <>
            <StudentPicker
              pickLabel={t("sport.dialog.pick")}
              isDisabled={(s) => (s.isPlayer ? t("sport.dialog.alreadyPlayer") : "")}
              onPick={(s) => setPicked({ _id: s._id, name: fullName(s) })}
            />
          </>
        )}

        {picked && (
          <>
            <div className={styles.chosen}>
              <span className={styles.name}>{picked.name}</span>
              {!editing && <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>{t("sport.dialog.change")}</Button>}
            </div>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="player-jersey">{t("sport.dialog.jersey")}</label>
                <input id="player-jersey" inputMode="numeric" value={jersey} onChange={(e) => setJersey(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="player-position">{t("sport.dialog.position")}</label>
                <input id="player-position" maxLength={30} value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
              <div className={`${styles.field} ${styles.wide}`}>
                <span>{t("sport.dialog.lessons")}</span>
                {lessons.length === 0 && <span className={styles.muted}>{t("sport.dialog.noLessons")}</span>}
                <div className={styles.checks}>
                  {lessons.map((l) => (
                    <label key={l._id} className={styles.check}>
                      <input type="checkbox" checked={lessonIds.includes(l._id)} onChange={() => toggleLesson(l._id)} />
                      {l.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        </ReadOnlyArea>
        )}

        <SaveNotice notice={notice} />
        {error && <div className={styles.formError} role="alert">{error}</div>}
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={onClose}>{t("sport.cancel")}</Button>
          {picked && lock.status !== "blocked" && <Button type="submit" loading={busy} disabled={readonly}>{t("sport.save")}</Button>}
        </div>
      </form>
    </div>
  );
}
