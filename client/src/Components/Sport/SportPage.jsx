import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { canStored } from "../../utils/session";
import { getCoaches, getPlayers, getSports, getTeams } from "../../WebServer/services/sport/functionsSport";
import SportsTab from "./SportsTab";
import TeamsTab from "./TeamsTab";
import PlayersTab from "./PlayersTab";
import TrainingsTab from "./TrainingsTab";
import styles from "./Sport.module.css";

export default function SportPage() {
  const { t, dir } = useI18n();
  const canManage = canStored("sports.manage");
  const canCoach = canManage || canStored("sports.coach");
  const [tab, setTab] = useState(canManage ? "sports" : "teams");
  const [data, setData] = useState({ sports: [], teams: [], players: [], coaches: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [sports, teams, players, coaches] = await Promise.all([getSports(), getTeams(), getPlayers(), getCoaches()]);
    const failed = [sports, teams, players, coaches].find((r) => !r.ok);
    if (failed) setError(failed.message || t("sport.loadError"));
    else {
      setError("");
      setData({ sports: sports.sports || [], teams: teams.teams || [], players: players.players || [], coaches: coaches.coaches || [] });
    }
    setLoading(false);
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const tabs = useMemo(
    () => [...(canManage ? ["sports"] : []), "teams", "players", "trainings"],
    [canManage],
  );
  const props = { ...data, canManage, canCoach, reload: load };

  return (
    <div className={styles.page} dir={dir}>
      <div className={styles.header}>
        <h1>{t("sport.title")}</h1>
        <p>{t("sport.subtitle")}</p>
      </div>
      <div className={styles.tabs} role="tablist">
        {tabs.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={styles.tab} onClick={() => setTab(key)}>
            {t(`sport.tabs.${key}`)}
          </button>
        ))}
      </div>
      {loading && <div className={styles.state}>{t("sport.loading")}</div>}
      {!loading && error && <div className={`${styles.state} ${styles.stateError}`} role="alert">{error}</div>}
      {!loading && !error && (
        <>
          {tab === "sports" && canManage && <SportsTab {...props} />}
          {tab === "teams" && <TeamsTab {...props} />}
          {tab === "players" && <PlayersTab {...props} />}
          {tab === "trainings" && <TrainingsTab {...props} />}
        </>
      )}
    </div>
  );
}
