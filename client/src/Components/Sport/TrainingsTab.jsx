import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import { getStoredUserId } from "../../utils/session";
import { createTraining, deleteTraining, getTrainings, updateTraining } from "../../WebServer/services/sport/functionsSport";
import { currentPresentIds, fromLocalInput } from "./sportForm";
import styles from "./Sport.module.css";

const fullName = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim();
const formatWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
};

export default function TrainingsTab({ teams, canManage, canCoach }) {
  const { t } = useI18n();
  const [teamId, setTeamId] = useState("");
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(null); // null | { startsAt, place }
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [present, setPresent] = useState([]);
  const [busy, setBusy] = useState(false);

  const team = teams.find((x) => x._id === teamId);
  const mayEdit = Boolean(team) && (canManage || (canCoach && (team.coachIds || []).map(String).includes(String(getStoredUserId()))));

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const res = await getTrainings(teamId);
    if (res.ok) setTrainings(res.trainings || []);
    else toast.warn(res.message);
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    setTrainings([]);
    setOpenId(null);
    setForm(null);
    load();
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    const startsAt = fromLocalInput(form.startsAt);
    if (!startsAt) return setError(t("sport.validation.whenRequired"));
    setBusy(true);
    const res = await createTraining(teamId, { startsAt, place: form.place.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    toast.success(t("sport.saved"));
    setForm(null);
    load();
  };

  const openAttendance = (training) => {
    setOpenId(training._id);
    // Ids of people who left the team are dropped: the server refuses them.
    setPresent(currentPresentIds(training, team.members));
  };

  const saveAttendance = async () => {
    setBusy(true);
    const currentIds = new Set((team.members || []).map((m) => String(m.studentId)));
    const res = await updateTraining(openId, { presentIds: present.filter((id) => currentIds.has(id)) });
    setBusy(false);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.saved"));
    setOpenId(null);
    load();
  };

  const remove = async (training) => {
    const confirmed = await ask("delete", { title: t("sport.deleteTitle"), message: t("sport.trainings.deleteConfirm") }).catch(() => false);
    if (!confirmed) return;
    const res = await deleteTraining(training._id);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.deleted"));
    load();
  };

  const toggle = (id) => setPresent((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <section className={styles.group}>
      {teams.length === 0 ? (
        <div className={styles.state}>{t("sport.trainings.noTeams")}</div>
      ) : (
        <div className={styles.toolbar}>
          <div className={styles.field}>
            <label htmlFor="training-team">{t("sport.trainings.team")}</label>
            <select id="training-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">{t("sport.trainings.chooseTeam")}</option>
              {teams.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
            </select>
          </div>
          {mayEdit && <Button onClick={() => { setForm({ startsAt: "", place: "" }); setError(""); }}>{t("sport.trainings.add")}</Button>}
        </div>
      )}
      {mayEdit && form && (
        <form className={styles.form} onSubmit={submit} noValidate>
          <h3>{t("sport.trainings.add")}</h3>
          <div className={styles.field}>
            <label htmlFor="training-when">{t("sport.trainings.when")}</label>
            <input id="training-when" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label htmlFor="training-place">{t("sport.trainings.place")}</label>
            <input id="training-place" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} />
          </div>
          {error && <div className={`${styles.error} ${styles.wide}`} role="alert">{error}</div>}
          <div className={`${styles.actions} ${styles.wide}`}>
            <Button type="submit" loading={busy}>{t("sport.save")}</Button>
            <Button variant="secondary" onClick={() => setForm(null)}>{t("sport.cancel")}</Button>
          </div>
        </form>
      )}
      {team && loading && <div className={styles.state}>{t("sport.loading")}</div>}
      {team && !loading && trainings.length === 0 && <div className={styles.state}>{t("sport.trainings.empty")}</div>}
      {team && (
        <ul className={styles.list}>
          {trainings.map((training) => (
            <li key={training._id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{formatWhen(training.startsAt)}{training.place ? ` · ${training.place}` : ""}</span>
                {training.recorded
                  ? <span className={`${styles.badge} ${styles.badgeOk}`}>{t("sport.trainings.presentCount")}: {currentPresentIds(training, team.members).length}</span>
                  : <span className={styles.badge}>{t("sport.trainings.notRecorded")}</span>}
                {openId === training._id && (
                  <div className={styles.group}>
                    {(team.members || []).length === 0 && <span className={styles.muted}>{t("sport.trainings.noMembers")}</span>}
                    <div className={styles.checks}>
                      {(team.members || []).map((m) => (
                        <label key={m.studentId} className={styles.check}>
                          <input type="checkbox" checked={present.includes(String(m.studentId))} onChange={() => toggle(String(m.studentId))} />
                          {fullName(m)}
                        </label>
                      ))}
                    </div>
                    <div className={styles.actions}>
                      <Button size="sm" loading={busy} onClick={saveAttendance}>{t("sport.trainings.saveAttendance")}</Button>
                      <Button size="sm" variant="secondary" onClick={() => setOpenId(null)}>{t("sport.cancel")}</Button>
                    </div>
                  </div>
                )}
              </div>
              {mayEdit && (
                <div className={styles.actions}>
                  {openId !== training._id && <Button variant="secondary" size="sm" onClick={() => openAttendance(training)}>{t("sport.trainings.attendance")}</Button>}
                  <Button variant="danger" size="sm" onClick={() => remove(training)}>{t("sport.remove")}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
