import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import Button from "../UI/Button.jsx";
import { searchStudents, searchUsers } from "../../WebServer/services/sport/functionsSport";
import styles from "./Sport.module.css";
import { passportSrc } from "../../utils/passportPhoto";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();
export const SEARCH_DELAY = 300;

// One search box over every student, or (second tab, owner 2026-11-09) every
// staff user: ID number or name. The whole list loads when it opens (empty
// search). `isDisabled(person)` returns the Arabic note shown instead of the
// pick button, or a falsy value when the row can be picked. Staff rows come
// with kind: "user".
export default function StudentPicker({ onPick, isDisabled, pickLabel }) {
  const { t } = useI18n();
  const [kind, setKind] = useState("student");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    // The first load is immediate; typing waits for a short pause.
    const timer = setTimeout(async () => {
      setLoading(true);
      const staff = kind === "user";
      const res = await (staff ? searchUsers : searchStudents)({ q: query.trim() });
      if (!live) return;
      setResults(res.ok ? (staff ? res.users : res.students) || [] : []);
      setLoading(false);
    }, query === "" ? 0 : SEARCH_DELAY);
    return () => { live = false; clearTimeout(timer); };
  }, [query, kind]);

  const kindTab = (value, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === value}
      className={`${styles.kindTab} ${kind === value ? styles.kindTabActive : ""}`}
      onClick={() => { if (kind !== value) { setResults([]); setKind(value); } }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className={styles.kindTabs} role="tablist" aria-label={t("sport.dialog.kinds")}>
        {kindTab("student", t("sport.dialog.students"))}
        {kindTab("user", t("sport.dialog.staff"))}
      </div>
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
      {loading && <div className={styles.emptyState}>{t(kind === "user" ? "sport.dialog.loadingStaff" : "sport.dialog.loadingStudents")}</div>}
      {!loading && results.length === 0 && <div className={styles.emptyState}>{t("sport.dialog.noResults")}</div>}
      <ul className={styles.results}>
        {results.map((s) => {
          const note = isDisabled ? isDisabled(s) : "";
          return (
            <li key={s._id} className={`${styles.result} ${note ? styles.resultDisabled : ""}`}>
              <span className={styles.resultInfo}>
                {s.photo
                  ? <img className={styles.thumb} src={passportSrc(s.photo)} alt={t("sport.dialog.photoAlt")} />
                  : <span className={styles.thumb} aria-hidden="true" />}
                <span>
                  <span className={styles.name}>{fullName(s)}</span>
                  {s.kind === "user" && <span className={styles.staffBadge} data-staff-badge>{t("sport.dialog.staffBadge")}</span>}
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
