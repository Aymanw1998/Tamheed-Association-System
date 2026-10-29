import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { canStored } from "../../utils/session";
import { getLessons, getPlayers, getSport } from "../../WebServer/services/sport/functionsSport";
import PlayersTab from "./PlayersTab";
import StatsSettingsTab from "./StatsSettingsTab";
import LessonsTab from "./LessonsTab";
import AttendanceTab from "./AttendanceTab";
import NoticesTab from "./NoticesTab";
import styles from "./Sport.module.css";

export default function SportPage() {
  const { t, dir } = useI18n();
  const canManage = canStored("sports.manage");
  const canCoach = canManage || canStored("sports.coach");
  const [tab, setTab] = useState("players");
  const [data, setData] = useState({ sport: null, players: [], lessons: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [sport, players, lessons] = await Promise.all([getSport(), getPlayers(), getLessons()]);
    const failed = [sport, players, lessons].find((r) => !r.ok);
    if (failed) setError(failed.message || t("sport.loadError"));
    else {
      setError("");
      setData({ sport: sport.sport, players: players.players || [], lessons: lessons.lessons || [] });
    }
    setLoading(false);
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const tabs = useMemo(
    () => ["players", "lessons", "attendance", "notices", ...(canManage ? ["settings"] : [])],
    [canManage],
  );
  const props = { ...data, canManage, canCoach, reload: load };

  return (
    <div className={styles.page} dir={dir}>
      <h1 className={styles.pageTitle}>{t("sport.title")}</h1>
      <div className={styles.tabs} role="tablist">
        {tabs.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={styles.tab} onClick={() => setTab(key)}>
            {t(`sport.tabs.${key}`)}
          </button>
        ))}
      </div>
      {loading && <div className={styles.emptyState}>{t("sport.loading")}</div>}
      {!loading && error && <div className={styles.formError} role="alert">{error}</div>}
      {!loading && !error && (
        <>
          {tab === "players" && <PlayersTab {...props} />}
          {tab === "lessons" && <LessonsTab {...props} />}
          {tab === "attendance" && <AttendanceTab {...props} />}
          {tab === "notices" && <NoticesTab {...props} />}
          {tab === "settings" && canManage && <StatsSettingsTab {...props} />}
        </>
      )}
    </div>
  );
}
