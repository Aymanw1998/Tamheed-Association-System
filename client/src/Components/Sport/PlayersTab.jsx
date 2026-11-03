import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import FilterDialog from "../UI/FilterDialog.jsx";
import { bumpStat, deletePlayer, issueLoginCard, signOutPlayer } from "../../WebServer/services/sport/functionsSport";
import AddPlayerDialog from "./AddPlayerDialog";
import PlayerCardModal, { Silhouette } from "./PlayerCardModal";
import LoginCardModal from "./LoginCardModal";
import styles from "./Sport.module.css";
import { passportSrc } from "../../utils/passportPhoto";
import withLock from "../../locks/withLock";
import useLiveRefresh from "../../locks/useLiveRefresh";
import { handleSaveError } from "../../locks/staleSave";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();

export default function PlayersTab({ sport, players, lessons, canCoach, canManage, reload }) {
  const { t } = useI18n();
  const stats = sport?.stats || [];
  const [rows, setRows] = useState(players);
  const [search, setSearch] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [dialog, setDialog] = useState(null); // null | { player? }
  const [pending, setPending] = useState({});
  const [cardOf, setCardOf] = useState(null); // studentId whose card is open
  const [loginCard, setLoginCard] = useState(null); // { player, card } of the sign-in card shown

  useEffect(() => setRows(players), [players]);
  useLiveRefresh(["player", "sport", "sportLesson", "sportAttendance"], reload);

  const ages = useMemo(
    () => [...new Set(rows.map((p) => p.age).filter((a) => a !== null && a !== undefined))].sort((a, b) => a - b),
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((p) => !q || fullName(p).toLowerCase().includes(q) || String(p.tz || "").includes(q))
      .filter((p) => !lessonId || p.lessons.some((l) => l._id === lessonId))
      .filter((p) => !age || String(p.age) === age)
      .filter((p) => !gender || p.gender === gender)
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "ar", { sensitivity: "base" }));
  }, [rows, search, lessonId, age, gender]);

  const bump = async (p, key, delta) => {
    const id = `${p.studentId}:${key}`;
    if (pending[id]) return;
    setPending((m) => ({ ...m, [id]: true }));
    let res;
    try {
      // The player is locked only for the length of this click.
      res = await withLock(`player:${p.studentId}`, () => bumpStat(p.studentId, key, delta));
    } catch (err) {
      setPending((m) => ({ ...m, [id]: false }));
      if (handleSaveError(err, { setNotice: (message) => toast.warn(message) })) return;
      return toast.warn(err?.response?.data?.message || err?.message);
    }
    setPending((m) => ({ ...m, [id]: false }));
    if (!res.ok) {
      if (handleSaveError(res, { setNotice: (message) => toast.warn(message) })) return;
      return toast.warn(res.message);
    }
    setRows((list) => list.map((x) => (x.studentId === p.studentId ? { ...x, values: { ...x.values, [key]: res.value } } : x)));
  };

  const remove = async (p) => {
    const confirmed = await ask("delete", {
      title: t("sport.players.removeTitle"), message: t("sport.players.removeConfirm"), confirmText: t("sport.players.removeOk"),
    }).catch(() => false);
    if (!confirmed) return;
    const res = await deletePlayer(p.studentId);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.removed"));
    reload();
  };

  // A player stays signed in to the sport site until he signs out or a
  // sports manager signs him out here, on every phone (owner, 2026-11-01).
  const signOut = async (p) => {
    const confirmed = await ask("change", {
      title: t("sport.players.signOutTitle"), message: t("sport.players.signOutConfirm"), confirmText: t("sport.players.signOut"),
    }).catch(() => false);
    if (!confirmed) return;
    const res = await signOutPlayer(p.studentId);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.players.signedOut"));
  };

  // A sign-in card (QR) for a player without email (owner, 2026-11-01). A
  // new one cancels the card printed before, so that is asked first.
  const printCard = async (p) => {
    if (p.cardIssuedAt) {
      const confirmed = await ask("change", {
        title: t("sport.players.loginCardAgain"), message: t("sport.players.loginCardAgainConfirm"), confirmText: t("sport.players.loginCardAgain"),
      }).catch(() => false);
      if (!confirmed) return;
    }
    const res = await issueLoginCard(p.studentId);
    if (!res.ok) return toast.warn(res.message);
    setLoginCard({ player: p, card: res });
    setRows((list) => list.map((r) => (r.studentId === p.studentId ? { ...r, cardIssuedAt: new Date().toISOString() } : r)));
  };

  const label = (key) => t(`sport.players.${key}`);
  const attendanceText = (a) => (a && a.rate !== null && a.rate !== undefined
    ? `${a.rate}% · ${label("absences")} ${a.absent} · ${label("lates")} ${a.late}`
    : label("noAttendance"));

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={label("search")}
          aria-label={label("searchLabel")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterDialog
          count={Boolean(lessonId) + Boolean(age) + Boolean(gender)}
          onClear={() => { setLessonId(""); setAge(""); setGender(""); }}
        >
          <label>{label("lessonFilter")}
            <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">{label("allLessons")}</option>
              {lessons.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
          </label>
          <label>{label("ageFilter")}
            <select value={age} onChange={(e) => setAge(e.target.value)}>
              <option value="">{label("allAges")}</option>
              {ages.map((a) => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </label>
          <label>{label("gender")}
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">{label("allGenders")}</option>
              <option value="ذكر">{label("male")}</option>
              <option value="انثى">{label("female")}</option>
            </select>
          </label>
        </FilterDialog>
        {canCoach && <Button onClick={() => setDialog({})}>{label("add")}</Button>}
      </div>

      <div className={styles.summary}>{visible.length} {label("count")}</div>

      <div className={styles.tableWrap}>
        <table className={`table ${styles.cards}`}>
          <thead>
            <tr>
              <th>{label("name")}</th>
              <th>{label("tz")}</th>
              <th>{label("age")}</th>
              <th>{label("lessons")}</th>
              <th>{label("jersey")}</th>
              <th>{label("position")}</th>
              <th>{label("attendance")}</th>
              {stats.map((s) => <th key={s.key}>{s.label}</th>)}
              {canCoach && <th>{label("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {visible.length > 0 ? visible.map((p) => (
              <tr key={p.studentId}>
                <td data-label={label("name")}>
                  <button type="button" className={styles.nameButton} title={label("openCard")} onClick={() => setCardOf(p.studentId)}>
                    {p.photo
                      ? <img className={styles.thumb} src={passportSrc(p.photo)} alt={label("photoAlt")} />
                      : <Silhouette className={`${styles.thumb} ${styles.thumbEmpty}`} />}
                    <span className={styles.name}>{fullName(p)}</span>
                  </button>
                </td>
                <td data-label={label("tz")}>{p.tz || label("none")}</td>
                <td data-label={label("age")}>{p.age ?? label("none")}</td>
                <td data-label={label("lessons")}>{p.lessons.length ? p.lessons.map((l) => l.name).join("، ") : label("none")}</td>
                <td data-label={label("jersey")}>{p.jerseyNumber ?? label("none")}</td>
                <td data-label={label("position")}>{p.position || label("none")}</td>
                <td data-label={label("attendance")}>{attendanceText(p.attendance)}</td>
                {stats.map((s) => {
                  const value = p.values?.[s.key] ?? 0;
                  const busy = Boolean(pending[`${p.studentId}:${s.key}`]);
                  return (
                    <td key={s.key} data-label={s.label}>
                      <span className={styles.stat}>
                        {canCoach && (
                          <Button size="sm" variant="secondary" disabled={busy || value <= 0} aria-label={`${label("decrease")} ${s.label}`} onClick={() => bump(p, s.key, -1)}>−</Button>
                        )}
                        <span className={styles.statValue}>{value}</span>
                        {canCoach && (
                          <Button size="sm" variant="secondary" disabled={busy} aria-label={`${label("increase")} ${s.label}`} onClick={() => bump(p, s.key, 1)}>+</Button>
                        )}
                      </span>
                    </td>
                  );
                })}
                {canCoach && (
                  <td data-label={label("actions")}>
                    <div className={styles.rowActions}>
                      <Button size="sm" variant="warning" onClick={() => setDialog({ player: p })}>{t("sport.edit")}</Button>
                      <Button size="sm" variant="danger" onClick={() => remove(p)}>{t("sport.remove")}</Button>
                      {canManage && <Button size="sm" variant="secondary" onClick={() => printCard(p)}>{label("loginCard")}</Button>}
                      {canManage && <Button size="sm" variant="secondary" onClick={() => signOut(p)}>{label("signOut")}</Button>}
                    </div>
                  </td>
                )}
              </tr>
            )) : (
              <tr><td colSpan={7 + stats.length + (canCoach ? 1 : 0)} className={styles.emptyState}>{label("empty")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {cardOf && rows.find((p) => p.studentId === cardOf) && (
        <PlayerCardModal player={rows.find((p) => p.studentId === cardOf)} stats={stats} onClose={() => setCardOf(null)} />
      )}

      {loginCard && <LoginCardModal player={loginCard.player} card={loginCard.card} onClose={() => setLoginCard(null)} />}

      {dialog && (
        <AddPlayerDialog
          lessons={lessons}
          player={dialog.player}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); reload(); }}
        />
      )}
    </div>
  );
}
