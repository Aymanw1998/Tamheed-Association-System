import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import { deletePlayer, savePlayer, searchStudents } from "../../WebServer/services/sport/functionsSport";
import { validateJersey } from "./sportForm";
import styles from "./Sport.module.css";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();
const EMPTY = { studentId: "", name: "", sportId: "", jerseyNumber: "", position: "" };

export default function PlayersTab({ sports, players, canCoach, reload }) {
  const { t } = useI18n();
  const [form, setForm] = useState(null); // null | { studentId, name, sportId, jerseyNumber, position, existing }
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Students are looked up only from 2 characters, after a short pause.
  useEffect(() => {
    if (!form || form.studentId) return undefined;
    const q = query.trim();
    if ([...q].length < 2) {
      setResults([]);
      setSearched(false);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const res = await searchStudents(q);
      if (!live) return;
      setResults(res.ok ? res.students || [] : []);
      setSearched(true);
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [query, form]);

  const startAdd = () => { setForm({ ...EMPTY }); setQuery(""); setResults([]); setError(""); };
  const startEdit = (p) => {
    setForm({ studentId: p.studentId, name: fullName(p), sportId: p.sportId, jerseyNumber: p.jerseyNumber ?? "", position: p.position || "", existing: true });
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.studentId) return setError(t("sport.validation.studentRequired"));
    if (!form.sportId) return setError(t("sport.validation.sportRequired"));
    const jerseyError = validateJersey(form.jerseyNumber);
    if (jerseyError) return setError(jerseyError);
    setBusy(true);
    const res = await savePlayer(form.studentId, form.sportId, {
      jerseyNumber: String(form.jerseyNumber).trim() === "" ? null : Number(form.jerseyNumber),
      position: form.position.trim(),
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    toast.success(t("sport.saved"));
    setForm(null);
    reload();
  };

  const remove = async (p) => {
    const confirmed = await ask("delete", { title: t("sport.deleteTitle"), message: t("sport.players.deleteConfirm") }).catch(() => false);
    if (!confirmed) return;
    const res = await deletePlayer(p.studentId, p.sportId);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.deleted"));
    reload();
  };

  const groups = sports
    .map((sport) => ({ sport, players: players.filter((p) => p.sportId === sport._id) }))
    .filter((g) => g.players.length);

  return (
    <section className={styles.group}>
      {canCoach && (
        <div className={styles.toolbar}>
          <Button onClick={startAdd} disabled={sports.length === 0}>{t("sport.players.add")}</Button>
          {sports.length === 0 && <span className={styles.muted}>{t("sport.players.noSports")}</span>}
        </div>
      )}
      {canCoach && form && (
        <form className={styles.form} onSubmit={submit} noValidate>
          <h3>{form.existing ? `${t("sport.players.editTitle")}: ${form.name}` : t("sport.players.add")}</h3>
          {!form.studentId && (
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="player-search">{t("sport.players.search")}</label>
              <input id="player-search" value={query} onChange={(e) => setQuery(e.target.value)} />
              {searched && results.length === 0 && <span className={styles.muted}>{t("sport.players.noResults")}</span>}
              <ul className={styles.results}>
                {results.map((s) => (
                  <li key={s._id} className={styles.row}>
                    <span>{fullName(s)}</span>
                    <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, studentId: s._id, name: fullName(s) })}>{t("sport.players.pick")}</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {form.studentId && !form.existing && <div className={`${styles.rowTitle} ${styles.wide}`}>{form.name}</div>}
          <div className={styles.field}>
            <label htmlFor="player-sport">{t("sport.players.sport")}</label>
            <select id="player-sport" value={form.sportId} disabled={form.existing} onChange={(e) => setForm({ ...form, sportId: e.target.value })}>
              <option value="">{t("sport.players.chooseSport")}</option>
              {sports.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="player-jersey">{t("sport.players.jersey")}</label>
            <input id="player-jersey" inputMode="numeric" value={form.jerseyNumber} onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label htmlFor="player-position">{t("sport.players.position")}</label>
            <input id="player-position" maxLength={30} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </div>
          {error && <div className={`${styles.error} ${styles.wide}`} role="alert">{error}</div>}
          <div className={`${styles.actions} ${styles.wide}`}>
            <Button type="submit" loading={busy}>{t("sport.save")}</Button>
            <Button variant="secondary" onClick={() => setForm(null)}>{t("sport.cancel")}</Button>
          </div>
        </form>
      )}
      {groups.length === 0 && <div className={styles.state}>{t("sport.players.empty")}</div>}
      {groups.map(({ sport, players: list }) => (
        <div key={sport._id} className={styles.group}>
          <h3>{sport.icon} {sport.name}</h3>
          <ul className={styles.list}>
            {list.map((p) => (
              <li key={`${p.studentId}-${p.sportId}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{fullName(p)}</span>
                  <span className={styles.muted}>
                    {t("sport.players.jerseyShort")}: {p.jerseyNumber ?? "—"} · {t("sport.players.position")}: {p.position || "—"}
                  </span>
                </div>
                {canCoach && (
                  <div className={styles.actions}>
                    <Button variant="secondary" size="sm" onClick={() => startEdit(p)}>{t("sport.edit")}</Button>
                    <Button variant="danger" size="sm" onClick={() => remove(p)}>{t("sport.remove")}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
