import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAlerts } from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import StatusBadge from "../UI/StatusBadge.jsx";
import useVehiclePermissions from "./useVehiclePermissions";
import { fillText, formatDateOnly, formatPlate } from "../../utils/vehicleDisplay";
import styles from "./Vehicle.module.css";
import dashboardStyles from "../Dashboard/Dashboard.module.css";

const MAX_SHOWN = 6;
const LEVEL_TONE = { expired: "danger", due7: "danger", due14: "warning", due30: "warning", missing: "neutral" };

// Dashboard panel: the server returns only the alerts this person is entitled
// to (everything for administrators and anyone allowed to view vehicles, just
// their assigned vehicles otherwise). Nothing is shown when there are none.
export default function VehicleAlerts() {
  const { t } = useI18n();
  const canOpen = useVehiclePermissions().can("view");
  const [state, setState] = useState({ loading: true, alerts: [], error: "" });

  useEffect(() => {
    let live = true;
    getAlerts().then((res) => {
      if (!live) return;
      setState(res.ok ? { loading: false, alerts: res.alerts || [], error: "" } : { loading: false, alerts: [], error: res.message });
    });
    return () => {
      live = false;
    };
  }, []);

  if (state.loading || state.error || state.alerts.length === 0) return null;

  const shown = state.alerts.slice(0, MAX_SHOWN);
  const more = state.alerts.length - shown.length;
  return (
    <section className={dashboardStyles.panel} aria-label={t("vehicles.alertsTitle")}>
      <div className={dashboardStyles.panelHeader}>
        <h2>{t("vehicles.alertsTitle")}</h2>
        {canOpen && <Link to="/vehicles">{t("vehicles.alertsOpen")}</Link>}
      </div>
      <ul className={styles.alertList}>
        {shown.map((alert) => (
          <li key={alert.key} className={styles.alertItem}>
            <span>
              <strong>{formatPlate(alert.plate)}</strong>
              {alert.nickname ? ` ${alert.nickname}` : ""} — {t(`vehicles.alertKind.${alert.kind}`)}
              {alert.dueDate ? ` (${formatDateOnly(alert.dueDate)})` : ""}
            </span>
            <StatusBadge tone={LEVEL_TONE[alert.level] || "neutral"}>{t(`vehicles.alertLevel.${alert.level}`)}</StatusBadge>
          </li>
        ))}
      </ul>
      {more > 0 && <p className={styles.fieldHint}>{fillText(t("vehicles.alertsMore"), { n: more })}</p>}
    </section>
  );
}
