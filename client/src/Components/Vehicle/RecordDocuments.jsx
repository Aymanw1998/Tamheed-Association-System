import React, { useState } from "react";
import {
  deleteDocument,
  fetchVehicleDocument,
  updateDocumentTitle,
} from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import NameDialog from "./NameDialog.jsx";
import { buildDownloadName, fillText, instantDate } from "../../utils/vehicleDisplay";
import styles from "./Vehicle.module.css";

export const formatSize = (bytes) => {
  const size = Number(bytes) || 0;
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
};

// The name people see: the one they typed, otherwise the document type.
export const docLabel = (doc, t) => doc.title || t(`vehicles.docKind.${doc.kind}`);

// File name offered when downloading: the user's name (or the type) plus the plate.
export const documentFileName = (doc, t, plate) =>
  buildDownloadName({ title: doc.title, kindLabel: t(`vehicles.docKind.${doc.kind}`), plate, storedName: doc.name });

// Opens or saves a file from memory; the server checked the permission and no
// public link ever exists.
export const openBlob = (blob, name, { download }) => {
  const url = URL.createObjectURL(blob);
  if (download) {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// Rename / delete shared by the attachments strip and the Documents tab.
export function useDocumentActions(vehicleId, onVehicle) {
  const { t } = useI18n();

  const rename = async (doc, title) => {
    const res = await updateDocumentTitle(vehicleId, doc.id, title);
    if (!res.ok) {
      toast.warn(res.message);
      return false;
    }
    toast.success(t("vehicles.renamed"));
    onVehicle(res.vehicle);
    return true;
  };

  const remove = async (doc) => {
    const confirmed = await ask("delete", {
      title: t("vehicles.removeFile"),
      message: fillText(t("vehicles.removeConfirm"), { name: docLabel(doc, t) }),
    }).catch(() => false);
    if (!confirmed) return false;
    const res = await deleteDocument(vehicleId, doc.id);
    if (!res.ok) {
      toast.warn(res.message);
      return false;
    }
    toast.success(t("vehicles.fileRemoved"));
    onVehicle(res.vehicle);
    return true;
  };

  return { rename, remove };
}

export function DocumentRow({ vehicleId, plate, doc, canManage = false, onVehicle }) {
  const { t } = useI18n();
  const [opening, setOpening] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const actions = useDocumentActions(vehicleId, onVehicle);

  const open = async (download) => {
    setOpening(true);
    const res = await fetchVehicleDocument(vehicleId, doc.id, { inline: !download });
    setOpening(false);
    if (!res.ok) return toast.warn(res.message);
    openBlob(res.blob, documentFileName(doc, t, plate), { download });
  };

  return (
    <li className={`${styles.docItem} ${doc.supersededAt ? styles.docSuperseded : ""}`}>
      <span>
        <strong>{docLabel(doc, t)}</strong>
        <span className={styles.sub}>
          {doc.title ? `${t(`vehicles.docKind.${doc.kind}`)} · ` : ""}
          {instantDate(doc.uploadedAt)} · {formatSize(doc.size)}
          {doc.uploadedByName ? ` · ${fillText(t("vehicles.auditBy"), { name: doc.uploadedByName })}` : ""}
        </span>
      </span>
      <span className={styles.actionsRow}>
        {doc.supersededAt && <StatusBadge tone="neutral">{t("vehicles.superseded")}</StatusBadge>}
        <Button size="sm" variant="secondary" loading={opening} onClick={() => open(false)}>{t("vehicles.view")}</Button>
        <Button size="sm" variant="secondary" disabled={opening} onClick={() => open(true)}>{t("vehicles.download")}</Button>
        {canManage && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setRenaming(true)}>{t("vehicles.rename")}</Button>
            <Button size="sm" variant="danger" onClick={() => actions.remove(doc)}>{t("vehicles.removeFile")}</Button>
          </>
        )}
      </span>
      {renaming && (
        <NameDialog
          heading={t("vehicles.rename")}
          fileLabel={t(`vehicles.docKind.${doc.kind}`)}
          initial={doc.title || ""}
          confirmLabel={t("vehicles.save")}
          busy={saving}
          onCancel={() => setRenaming(false)}
          onConfirm={async (title) => {
            setSaving(true);
            const ok = await actions.rename(doc, title);
            setSaving(false);
            if (ok) setRenaming(false);
          }}
        />
      )}
    </li>
  );
}
