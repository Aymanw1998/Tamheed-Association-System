import React, { useEffect, useRef, useState } from "react";
import { extractVehicleDocument, getExtractStatus } from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import { fillText } from "../../utils/vehicleDisplay";
import { mergeScan, scanToDraft } from "../../utils/vehicleScan";
import styles from "./Vehicle.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const IDLE = { status: "idle", result: null, file: null, message: "" };

// One status request shared by every form on the page.
let statusPromise = null;
const loadStatus = () => {
  if (!statusPromise) statusPromise = getExtractStatus().then((res) => (res.ok ? res.available !== false : true));
  return statusPromise;
};

const warningKey = (w) => (w.startsWith("invalid_date") || w.startsWith("dates_reversed") ? "dates" : w);

// Optional helper inside a form: the server reads the document and returns a
// PROPOSAL; "fill" copies it into empty fields only. Nothing is saved here.
export default function DocumentScan({ target, vehicleId = "", draft, onApply }) {
  const { t } = useI18n();
  const input = useRef(null);
  const [state, setState] = useState(IDLE);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let alive = true;
    loadStatus().then((ok) => alive && setAvailable(ok));
    return () => { alive = false; };
  }, []);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setState({ status: "loading", result: null, file, message: "" });
    const res = await extractVehicleDocument(file, { vehicleId, expected: target === "vehicle" ? "any" : target });
    if (!res.ok) return setState({ status: "message", result: null, file: null, message: res.message });
    setState({ status: "found", result: res, file, message: "" });
  };

  const patch = state.result ? scanToDraft(target, state.result.proposed) : {};
  const rows = Object.entries(patch);
  const warnings = Array.from(new Set((state.result?.warnings || []).map(warningKey)));
  const otherType = state.result && target !== "vehicle" && state.result.documentType !== "unknown" && state.result.documentType !== target;

  const apply = () => {
    const { draft: next, filled, skipped } = mergeScan(draft, patch);
    onApply(next, state.file);
    toast.success(fillText(t("vehicles.scan.applied"), { n: filled.length }));
    if (skipped.length) toast.warn(fillText(t("vehicles.scan.skipped"), { n: skipped.length }));
    setState(IDLE);
  };

  return (
    <div className={styles.wide}>
      <div className={styles.actionsRow}>
        <Button type="button" variant="secondary" size="sm" loading={state.status === "loading"} disabled={!available} onClick={() => input.current?.click()}>
          {t("vehicles.scan.button")}
        </Button>
        <span className={styles.fieldHint}>{!available ? t("vehicles.scan.unavailable") : state.status === "loading" ? t("vehicles.scan.reading") : t("vehicles.scan.hint")}</span>
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={pick} />
      </div>

      {state.status === "message" && <p className={styles.note} role="status">{state.message}</p>}

      {state.status === "found" && (
        <div className={styles.inlineForm} role="region" aria-label={t("vehicles.scan.title")}>
          <strong>{t("vehicles.scan.title")}</strong>
          {otherType && <p className={styles.note} role="alert">{t("vehicles.scan.otherType")}</p>}
          {warnings.map((w) => <p key={w} className={styles.note} role="alert">{t(`vehicles.scan.warnings.${w}`)}</p>)}
          <table className={styles.table}>
            <tbody>
              {rows.map(([key, value]) => (
                <tr key={key}>
                  <td>{t(`vehicles.f.${key === "type" ? "policyType" : key}`)}</td>
                  <td><strong>{key === "type" ? t(`vehicles.policyType.${value}`) : value}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.actionsRow}>
            <Button type="button" size="sm" disabled={rows.length === 0} onClick={apply}>{t("vehicles.scan.apply")}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setState(IDLE)}>
              {t("vehicles.scan.dismiss")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
