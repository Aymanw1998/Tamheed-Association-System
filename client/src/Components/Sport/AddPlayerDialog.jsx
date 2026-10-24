import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import { savePlayer, searchStudents } from "../../WebServer/services/sport/functionsSport";
import { validateJersey } from "./sportForm";
import styles from "./Sport.module.css";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();

// Adds a student as a player, or (with `player`) edits an existing player.
// The full lessonIds list is always sent: leaving it out would remove the
// player from every lesson.
export default function AddPlayerDialog({ lessons, player, onClose, onSaved }) {
  const { t } = useI18n();
  const editing = Boolean(player);
  const [picked, setPicked] = useState(editing ? { _id: player.studentId, name: fullName(player) } : null);
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState("");
  const [gender, setGender] = useState("");
  const [school, setSchool] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [jersey, setJersey] = useState(editing ? (player.jerseyNumber ?? "") : "");
  const [position, setPosition] = useState(editing ? (player.position || "") : "");
  const [lessonIds, setLessonIds] = useState(editing ? (player.lessons || []).map((l) => l._id) : []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = t(editing ? "sport.players.editTitle" : "sport.dialog.title");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Students are looked up from 2 characters, after a short pause.
  useEffect(() => {
    if (picked) return undefined;
    const q = query.trim();
    if ([...q].length < 2) {
      setResults([]);
      setSearched(false);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const res = await searchStudents({ q, layer: layer.trim(), gender, school: school.trim() });
      if (!live) return;
      setResults(res.ok ? res.students || [] : []);
      setSearched(true);
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [query, layer, gender, school, picked]);

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
    if (!res.ok) return setError(res.message);
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

        {!picked && (
          <>
            <input
              type="search"
              className={styles.dialogSearch}
              placeholder={t("sport.dialog.search")}
              aria-label={t("sport.dialog.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className={styles.dialogFilters}>
              <input placeholder={t("sport.dialog.layer")} aria-label={t("sport.dialog.layer")} value={layer} onChange={(e) => setLayer(e.target.value)} />
              <select aria-label={t("sport.dialog.gender")} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">{t("sport.dialog.anyGender")}</option>
                <option value="ذكر">{t("sport.players.male")}</option>
                <option value="انثى">{t("sport.players.female")}</option>
              </select>
              <input placeholder={t("sport.dialog.school")} aria-label={t("sport.dialog.school")} value={school} onChange={(e) => setSchool(e.target.value)} />
            </div>
            {searched && results.length === 0 && <div className={styles.emptyState}>{t("sport.dialog.noResults")}</div>}
            <ul className={styles.results}>
              {results.map((s) => (
                <li key={s._id} className={`${styles.result} ${s.isPlayer ? styles.resultDisabled : ""}`}>
                  <span>
                    <span className={styles.name}>{fullName(s)}</span>
                    <span className={styles.muted}> · {s.age ?? t("sport.players.none")}{s.layer ? ` · ${s.layer}` : ""}</span>
                  </span>
                  {s.isPlayer ? (
                    <span className={styles.muted}>{t("sport.dialog.alreadyPlayer")}</span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setPicked({ _id: s._id, name: fullName(s) })}>{t("sport.dialog.pick")}</Button>
                  )}
                </li>
              ))}
            </ul>
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

        {error && <div className={styles.formError} role="alert">{error}</div>}
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={onClose}>{t("sport.cancel")}</Button>
          {picked && <Button type="submit" loading={busy}>{t("sport.save")}</Button>}
        </div>
      </form>
    </div>
  );
}
