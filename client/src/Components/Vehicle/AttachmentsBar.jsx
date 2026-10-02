import React, { useRef, useState } from "react";
import { fetchVehicleDocument, uploadVehicleDocument } from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { instantDate } from "../../utils/vehicleDisplay";
import { docLabel, documentFileName, openBlob, useDocumentActions } from "./RecordDocuments.jsx";
import NameDialog from "./NameDialog.jsx";
import styles from "./Vehicle.module.css";

const icon = (children) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const ClipIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.4 11.6 12.2 20.8a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5" />
  </svg>
);
const DownloadIcon = () => icon(<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />);
const PencilIcon = () => icon(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />);
const TrashIcon = () => icon(<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 11v6m4-6v6" />);

// A slim strip at the top of a section: the files attached to that section as
// small chips (click to view; download, rename, delete icons) and one "attach"
// button. Choosing a file opens a small window for its optional name, then it
// uploads. One line tall; the Documents tab keeps the full list.
export default function AttachmentsBar({ vehicle, linkedType, defaultKind, canAccess, canUpload, onVehicle }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [dialog, setDialog] = useState(null); // { mode: "upload", file } | { mode: "rename", doc }
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState("");
  const actions = useDocumentActions(vehicle._id, onVehicle);

  if (!canAccess) return null;
  const docs = (vehicle.documents || []).filter((doc) => doc.linkedType === linkedType && !doc.supersededAt);

  const pick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setDialog({ mode: "upload", file });
  };

  const confirm = async (title) => {
    setBusy(true);
    if (dialog.mode === "upload") {
      const res = await uploadVehicleDocument(vehicle._id, { file: dialog.file, kind: defaultKind, linkedType, title });
      setBusy(false);
      if (!res.ok) return toast.warn(res.message);
      toast.success(t("vehicles.uploaded"));
      onVehicle(res.vehicle);
      setDialog(null);
      return;
    }
    const ok = await actions.rename(dialog.doc, title);
    setBusy(false);
    if (ok) setDialog(null);
  };

  const open = async (doc, download) => {
    setOpeningId(doc.id);
    const res = await fetchVehicleDocument(vehicle._id, doc.id, { inline: !download });
    setOpeningId("");
    if (!res.ok) return toast.warn(res.message);
    openBlob(res.blob, documentFileName(doc, t, vehicle.plate), { download });
  };

  return (
    <div className={styles.attachBar} role="group" aria-label={t("vehicles.attachments")}>
      <span className={styles.attachLabel}>
        <ClipIcon />
        {t("vehicles.attachments")}
        {docs.length > 0 && <span className={styles.attachCount}>{docs.length}</span>}
      </span>

      {docs.map((doc) => (
        <span key={doc.id} className={styles.chip}>
          <button
            type="button"
            className={styles.chipMain}
            disabled={openingId === doc.id}
            onClick={() => open(doc, false)}
            title={`${t(`vehicles.docKind.${doc.kind}`)} · ${instantDate(doc.uploadedAt)}`}
          >
            <span className={styles.chipText}>{docLabel(doc, t)}</span>
            <span className={styles.chipDate}>{instantDate(doc.uploadedAt)}</span>
          </button>
          <button type="button" className={styles.chipIcon} aria-label={`${t("vehicles.download")} — ${docLabel(doc, t)}`} disabled={openingId === doc.id} onClick={() => open(doc, true)}>
            <DownloadIcon />
          </button>
          {canUpload && (
            <>
              <button type="button" className={styles.chipIcon} aria-label={`${t("vehicles.rename")} — ${docLabel(doc, t)}`} onClick={() => setDialog({ mode: "rename", doc })}>
                <PencilIcon />
              </button>
              <button type="button" className={`${styles.chipIcon} ${styles.chipDanger}`} aria-label={`${t("vehicles.removeFile")} — ${docLabel(doc, t)}`} onClick={() => actions.remove(doc)}>
                <TrashIcon />
              </button>
            </>
          )}
        </span>
      ))}

      {docs.length === 0 && !canUpload && <span className={styles.fieldHint}>{t("vehicles.noDocuments")}</span>}

      {canUpload && (
        <>
          <input ref={inputRef} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={pick} data-testid={`attach-${linkedType}`} />
          <button type="button" className={styles.attachBtn} onClick={() => inputRef.current?.click()}>
            + {t("vehicles.attach")}
          </button>
        </>
      )}

      {dialog && (
        <NameDialog
          heading={dialog.mode === "upload" ? t("vehicles.attach") : t("vehicles.rename")}
          fileLabel={dialog.mode === "upload" ? dialog.file.name : t(`vehicles.docKind.${dialog.doc.kind}`)}
          initial={dialog.mode === "rename" ? dialog.doc.title || "" : ""}
          confirmLabel={dialog.mode === "upload" ? t("vehicles.uploadDocument") : t("vehicles.save")}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
