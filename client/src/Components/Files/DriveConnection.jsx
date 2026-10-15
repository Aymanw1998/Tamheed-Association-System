import { useEffect, useState } from "react";
import { getDriveConnectUrl, getDriveStatus } from "../../WebServer/services/storage/functionsStorage";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { fillText } from "../../utils/vehicleDisplay";
import { isStoredAdmin } from "../../utils/session";
import { ask } from "../Provides/confirmBus";
import styles from "./FilesPage.module.css";

const RESULT_TOASTS = { connected: "success", denied: "warn", error: "warn" };
const RESULT_KEYS = { connected: "files.drive.done", denied: "files.drive.denied", error: "files.drive.error" };

// Administrators see which Google account the whole app stores files in.
// Only the system account (the server reports it as canConnect) gets the
// connect button; the server issues the consent URL with a one-time state.
export default function DriveConnection() {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = isStoredAdmin();

  useEffect(() => {
    if (!isAdmin) return;
    // Google's callback lands on /files?drive=<result>; report it once.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("drive");
    if (RESULT_TOASTS[result]) {
      toast[RESULT_TOASTS[result]](t(RESULT_KEYS[result]));
      params.delete("drive");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    getDriveStatus()
      .then((data) =>
        setStatus({ connected: Boolean(data?.connected), email: data?.email || "", canConnect: Boolean(data?.canConnect) })
      )
      .catch(() => setStatus({ connected: false, email: "", canConnect: false }));
  }, [isAdmin, t]);

  if (!isAdmin || !status) return null;

  const connect = async () => {
    if (status.connected) {
      let ok = false;
      try {
        ok = await ask("change", { title: t("files.drive.replace"), message: t("files.drive.replaceConfirm") });
      } catch {
        ok = false;
      }
      if (!ok) return;
    }
    setBusy(true);
    try {
      const url = await getDriveConnectUrl();
      if (!url) throw new Error("no url");
      window.location.assign(url);
    } catch {
      setBusy(false);
      toast.warn(t("files.drive.startFailed"));
    }
  };

  return (
    <div className={styles.storageStats}>
      <div className={styles.storageStatsTop}>
        <strong>{t("files.drive.title")}</strong>
        <span>
          {status.connected
            ? fillText(t("files.drive.connectedAs"), { email: status.email })
            : t("files.drive.notConnected")}
        </span>
      </div>
      {status.canConnect ? (
        <button type="button" onClick={connect} disabled={busy}>
          {status.connected ? t("files.drive.replace") : t("files.drive.connect")}
        </button>
      ) : (
        <span>{t("files.drive.systemOnly")}</span>
      )}
    </div>
  );
}
