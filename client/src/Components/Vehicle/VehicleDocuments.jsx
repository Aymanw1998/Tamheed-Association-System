import React, { useEffect, useMemo, useState } from "react";
import {
  getVehicleAudit,
  uploadVehicleDocument,
} from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import Field from "./Field.jsx";
import { DocumentRow } from "./RecordDocuments.jsx";
import { fillText, formatDateOnly, formatInstant, instantDate } from "../../utils/vehicleDisplay";
import styles from "./Vehicle.module.css";

export function VehicleDocuments({ vehicle, canUpload, canAccess, onVehicle, onDirtyChange }) {
  const { t } = useI18n();
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("license");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("vehicle:");
  const [replacesId, setReplacesId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const documents = vehicle.documents || [];
  const archived = vehicle.status === "archived";

  // Report an in-progress upload (a chosen file) as an unsaved change.
  useEffect(() => {
    onDirtyChange?.("documents-form", Boolean(file));
    return () => onDirtyChange?.("documents-form", false);
  }, [file, onDirtyChange]);

  const linkOptions = useMemo(() => {
    const options = [{ value: "vehicle:", label: t("vehicles.linkVehicle") }];
    (vehicle.licenses || []).forEach((record) =>
      options.push({ value: `license:${record.id}`, label: `${t("vehicles.tabs.license")} ${formatDateOnly(record.validUntil)}` })
    );
    (vehicle.tests || []).forEach((record) =>
      options.push({ value: `test:${record.id}`, label: `${t("vehicles.tabs.test")} ${formatDateOnly(record.testDate) || t(`vehicles.testResult.${record.result}`)}` })
    );
    (vehicle.policies || []).forEach((record) =>
      options.push({ value: `policy:${record.id}`, label: `${t("vehicles.tabs.insurance")} ${record.insurer || ""}` })
    );
    return options;
  }, [vehicle, t]);

  const replaceOptions = [
    { value: "", label: t("vehicles.noReplace") },
    ...documents
      .filter((doc) => !doc.supersededAt)
      .map((doc) => ({ value: doc.id, label: `${t(`vehicles.docKind.${doc.kind}`)} — ${instantDate(doc.uploadedAt)}` })),
  ];

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    const [linkedType, linkedId] = link.split(":");
    setBusy(true);
    setError("");
    const res = await uploadVehicleDocument(vehicle._id, { file, kind, linkedType, linkedId, replacesId, title: title.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return toast.warn(res.message);
    }
    toast.success(t("vehicles.uploaded"));
    setFile(null);
    setTitle("");
    setReplacesId("");
    event.target.reset?.();
    onVehicle(res.vehicle);
  };

  if (!canAccess) return <div className={styles.panel}><p className={styles.note}>{t("vehicles.documentsNoAccess")}</p></div>;

  return (
    <div className={styles.panel}>
      {canUpload && !archived && (
        <form className={styles.inlineForm} onSubmit={upload} noValidate>
          <h3>{t("vehicles.uploadDocument")}</h3>
          <div className={styles.formGrid}>
            <div className={`${styles.field} ${styles.wide}`}>
              <label htmlFor="vehicle-doc-file">{t("vehicles.chooseFile")}</label>
              <input
                id="vehicle-doc-file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </div>
            <Field id="vehicle-doc-title" label={t("vehicles.fileName")} value={title} onChange={setTitle} placeholder={t("vehicles.fileNameHint")} maxLength={100} wide />
            <Field
              id="vehicle-doc-kind"
              type="select"
              label={t("vehicles.f.type")}
              value={kind}
              onChange={setKind}
              options={Object.keys(t("vehicles.docKind", {})).map((key) => ({ value: key, label: t(`vehicles.docKind.${key}`) }))}
            />
            <Field id="vehicle-doc-link" type="select" label={t("vehicles.linkedTo")} value={link} onChange={setLink} options={linkOptions} />
            <Field
              id="vehicle-doc-replaces"
              type="select"
              label={t("vehicles.replaces")}
              value={replacesId}
              onChange={setReplacesId}
              options={replaceOptions}
              wide
            />
          </div>
          {error && <span className={styles.fieldError} role="alert">{error}</span>}
          <div className={styles.actionsRow}>
            <Button type="submit" loading={busy} disabled={!file}>{t("vehicles.uploadDocument")}</Button>
          </div>
        </form>
      )}

      {documents.length === 0 && <p className={styles.fieldHint}>{t("vehicles.noDocuments")}</p>}
      <ul className={styles.docList}>
        {[...documents].reverse().map((doc) => (
          <DocumentRow key={doc.id} vehicleId={vehicle._id} plate={vehicle.plate} doc={doc} canManage={canUpload && !archived} onVehicle={onVehicle} />
        ))}
      </ul>
    </div>
  );
}

const describeChange = (change) => {
  const show = (value) => (value === "" || value === undefined || value === null ? "—" : String(value));
  return `${change.field}: ${show(change.from)} ← ${show(change.to)}`;
};

export function VehicleHistory({ vehicleId }) {
  const { t } = useI18n();
  const [state, setState] = useState({ loading: true, entries: [], error: "" });

  useEffect(() => {
    let live = true;
    getVehicleAudit(vehicleId).then((res) => {
      if (!live) return;
      setState(res.ok ? { loading: false, entries: res.entries || [], error: "" } : { loading: false, entries: [], error: res.message });
    });
    return () => {
      live = false;
    };
  }, [vehicleId]);

  if (state.loading) return <div className={styles.panel}>{t("vehicles.loading")}</div>;
  if (state.error) return <div className={`${styles.state} ${styles.stateError}`} role="alert">{state.error}</div>;
  return (
    <div className={styles.panel}>
      {state.entries.length === 0 && <p className={styles.fieldHint}>{t("vehicles.auditEmpty")}</p>}
      <ol className={styles.timeline}>
        {state.entries.map((entry, index) => (
          <li key={entry._id || index}>
            <strong>{t(`vehicles.actions.${entry.action}`, entry.action)}</strong>{" "}
            <small>
              {formatInstant(entry.at)}
              {entry.byName ? ` · ${fillText(t("vehicles.auditBy"), { name: entry.byName })}` : ""}
            </small>
            {(entry.changes || []).map((change, i) => (
              <div key={i} className={styles.correction}>{describeChange(change)}</div>
            ))}
            {entry.reason && <div className={styles.correction}>{entry.reason}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
