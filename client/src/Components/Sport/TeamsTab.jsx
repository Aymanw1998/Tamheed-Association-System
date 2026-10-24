import React, { useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import { getStoredUserId } from "../../utils/session";
import { createTeam, deleteTeam, setTeamMembers, updateTeam } from "../../WebServer/services/sport/functionsSport";
import styles from "./Sport.module.css";

const EMPTY = { name: "", sportId: "", coachIds: [] };
const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();
const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export default function TeamsTab({ sports, teams, players, coaches, canManage, canCoach, reload }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(null); // null | "new" | team id
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [membersOf, setMembersOf] = useState(null); // team id
  const [picked, setPicked] = useState([]);
  const userId = String(getStoredUserId());

  // UI hint only: the server decides who may change a team's members.
  const mayEditMembers = (team) => canManage || (canCoach && (team.coachIds || []).map(String).includes(userId));

  const open = (team) => {
    setEditing(team ? team._id : "new");
    setForm(team ? { name: team.name, sportId: String(team.sportId), coachIds: (team.coachIds || []).map(String) } : EMPTY);
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setError(t("sport.validation.teamName"));
    if (!form.sportId) return setError(t("sport.validation.sportRequired"));
    setBusy(true);
    const payload = { name: form.name.trim(), sportId: form.sportId, coachIds: form.coachIds };
    const res = editing === "new" ? await createTeam(payload) : await updateTeam(editing, payload);
    setBusy(false);
    // The server's Arabic message is shown as is (for example a sport change on a team with members).
    if (!res.ok) return setError(res.message);
    toast.success(t("sport.saved"));
    setEditing(null);
    reload();
  };

  const remove = async (team) => {
    const confirmed = await ask("delete", { title: t("sport.deleteTitle"), message: t("sport.teams.deleteConfirm") }).catch(() => false);
    if (!confirmed) return;
    const res = await deleteTeam(team._id);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.deleted"));
    reload();
  };

  const openMembers = (team) => {
    setMembersOf(team._id);
    setPicked((team.members || []).map((m) => String(m.studentId)));
  };

  const saveMembers = async () => {
    setBusy(true);
    const res = await setTeamMembers(membersOf, picked);
    setBusy(false);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.saved"));
    setMembersOf(null);
    reload();
  };

  const bySport = sports
    .map((sport) => ({ sport, teams: teams.filter((tm) => String(tm.sportId) === sport._id) }))
    .filter((g) => g.teams.length);

  return (
    <section className={styles.group}>
      {canManage && (
        <div className={styles.toolbar}>
          <Button onClick={() => open(null)} disabled={sports.length === 0}>{t("sport.teams.add")}</Button>
          {sports.length === 0 && <span className={styles.muted}>{t("sport.teams.noSports")}</span>}
        </div>
      )}
      {canManage && editing && (
        <form className={styles.form} onSubmit={submit} noValidate>
          <h3>{editing === "new" ? t("sport.teams.add") : t("sport.teams.editTitle")}</h3>
          <div className={styles.field}>
            <label htmlFor="team-name">{t("sport.teams.name")}</label>
            <input id="team-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label htmlFor="team-sport">{t("sport.teams.sport")}</label>
            <select id="team-sport" value={form.sportId} onChange={(e) => setForm({ ...form, sportId: e.target.value })}>
              <option value="">{t("sport.teams.chooseSport")}</option>
              {sports.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <fieldset className={`${styles.field} ${styles.wide}`}>
            <legend>{t("sport.teams.coaches")}</legend>
            {coaches.length === 0 && <span className={styles.muted}>{t("sport.teams.noCoaches")}</span>}
            <div className={styles.checks}>
              {coaches.map((c) => (
                <label key={c.id} className={styles.check}>
                  <input type="checkbox" checked={form.coachIds.includes(c.id)} onChange={() => setForm({ ...form, coachIds: toggle(form.coachIds, c.id) })} />
                  {fullName(c)}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <div className={`${styles.error} ${styles.wide}`} role="alert">{error}</div>}
          <div className={`${styles.actions} ${styles.wide}`}>
            <Button type="submit" loading={busy}>{t("sport.save")}</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>{t("sport.cancel")}</Button>
          </div>
        </form>
      )}
      {bySport.length === 0 && <div className={styles.state}>{t("sport.teams.empty")}</div>}
      {bySport.map(({ sport, teams: list }) => (
        <div key={sport._id} className={styles.group}>
          <h3>{sport.icon} {sport.name}</h3>
          <ul className={styles.list}>
            {list.map((team) => {
              const sportPlayers = players.filter((p) => p.sportId === String(team.sportId));
              return (
                <li key={team._id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{team.name}</span>
                    <span className={styles.muted}>{t("sport.teams.coaches")}: {(team.coachNames || []).join("، ") || "—"}</span>
                    <span className={styles.muted}>{t("sport.teams.members")}: {(team.members || []).map(fullName).join("، ") || t("sport.teams.noMembers")}</span>
                    {membersOf === team._id && (
                      <div className={styles.group}>
                        {sportPlayers.length === 0 && <span className={styles.muted}>{t("sport.teams.noPlayers")}</span>}
                        <div className={styles.checks}>
                          {sportPlayers.map((p) => (
                            <label key={p.studentId} className={styles.check}>
                              <input type="checkbox" checked={picked.includes(p.studentId)} onChange={() => setPicked(toggle(picked, p.studentId))} />
                              {fullName(p)}
                            </label>
                          ))}
                        </div>
                        <div className={styles.actions}>
                          <Button size="sm" loading={busy} onClick={saveMembers}>{t("sport.save")}</Button>
                          <Button size="sm" variant="secondary" onClick={() => setMembersOf(null)}>{t("sport.cancel")}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={styles.actions}>
                    {mayEditMembers(team) && membersOf !== team._id && (
                      <Button variant="secondary" size="sm" onClick={() => openMembers(team)}>{t("sport.teams.editMembers")}</Button>
                    )}
                    {canManage && <Button variant="secondary" size="sm" onClick={() => open(team)}>{t("sport.edit")}</Button>}
                    {canManage && <Button variant="danger" size="sm" onClick={() => remove(team)}>{t("sport.remove")}</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
