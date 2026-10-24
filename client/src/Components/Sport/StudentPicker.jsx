import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import Button from "../UI/Button.jsx";
import { searchStudents } from "../../WebServer/services/sport/functionsSport";
import styles from "./Sport.module.css";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();
export const SEARCH_DELAY = 300;

// One search box over every student: ID number or name. The whole list loads
// when it opens (empty search). `isDisabled(student)` returns the Arabic note
// shown instead of the pick button, or a falsy value when the row can be picked.
export default function StudentPicker({ onPick, isDisabled, pickLabel }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    // The first load is immediate; typing waits for a short pause.
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchStudents({ q: query.trim() });
      if (!live) return;
      setResults(res.ok ? res.students || [] : []);
      setLoading(false);
    }, query === "" ? 0 : SEARCH_DELAY);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  return (
    <>
      <input
        type="search"
        className={styles.dialogSearch}
        placeholder={t("sport.dialog.search")}
        aria-label={t("sport.dialog.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        autoFocus
      />
      {loading && <div className={styles.emptyState}>{t("sport.dialog.loadingStudents")}</div>}
      {!loading && results.length === 0 && <div className={styles.emptyState}>{t("sport.dialog.noResults")}</div>}
      <ul className={styles.results}>
        {results.map((s) => {
          const note = isDisabled ? isDisabled(s) : "";
          return (
            <li key={s._id} className={`${styles.result} ${note ? styles.resultDisabled : ""}`}>
              <span className={styles.resultInfo}>
                {s.photo
                  ? <img className={styles.thumb} src={s.photo} alt={t("sport.dialog.photoAlt")} />
                  : <span className={styles.thumb} aria-hidden="true" />}
                <span>
                  <span className={styles.name}>{fullName(s)}</span>
                  <span className={styles.muted}>
                    {` · ${t("sport.dialog.tz")} ${s.tz || t("sport.players.none")} · ${s.age ?? t("sport.players.none")}${s.layer ? ` · ${s.layer}` : ""}`}
                  </span>
                </span>
              </span>
              {note ? (
                <span className={styles.muted}>{note}</span>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => onPick(s)}>{pickLabel}</Button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
