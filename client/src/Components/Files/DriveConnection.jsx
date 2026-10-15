import { useEffect, useState } from "react";
import { getDriveConnectUrl, getDriveStatus } from "../../WebServer/services/storage/functionsStorage";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { isStoredAdmin } from "../../utils/session";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import styles from "./DriveConnection.module.css";

// Google Drive's mark, used here only to identify the connected service.
const DriveIcon = () => (
  <svg viewBox="0 0 87.3 78" aria-hidden="true" focusable="false">
    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 000 53h27.5z" fill="#00ac47" />
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
    <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="M73.4 26.5L60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
);

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
    <section className={styles.card} aria-label={t("files.drive.title")}>
      <span className={styles.icon}>
        <DriveIcon />
      </span>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{t("files.drive.title")}</span>
          <StatusBadge tone={status.connected ? "success" : "warning"}>
            {status.connected ? t("files.drive.statusOn") : t("files.drive.statusOff")}
          </StatusBadge>
        </div>
        {status.connected ? (
          <span className={styles.email} title={status.email}>{status.email}</span>
        ) : (
          <span className={styles.hint}>{t("files.drive.notConnected")}</span>
        )}
        {!status.canConnect && <span className={styles.hint}>{t("files.drive.systemOnly")}</span>}
      </div>

      {status.canConnect && (
        <div className={styles.action}>
          <Button
            variant={status.connected ? "secondary" : "primary"}
            size="sm"
            loading={busy}
            onClick={connect}
          >
            {status.connected ? t("files.drive.replace") : t("files.drive.connect")}
          </Button>
        </div>
      )}
    </section>
  );
}
