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
import { isDemo } from "../../journey/demoMode";
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

// Training mode: a demo document is shown inside the page. No new tab opens
// and nothing is saved to the device.
const showDemoDocument = async (blob, name) => {
  let text = "";
  try {
    text = await blob.text();
  } catch {
    text = "";
  }
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "معاينة المستند");
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "10000", display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(13, 48, 64, .72)", direction: "rtl", padding: "16px",
  });
  const card = document.createElement("div");
  Object.assign(card.style, {
    background: "#fff", color: "#1b2327", borderRadius: "12px", padding: "20px", maxWidth: "480px", width: "100%",
    boxShadow: "0 8px 24px rgba(0,0,0,.3)", fontFamily: "inherit",
  });
  const heading = document.createElement("h2");
  heading.textContent = name;
  Object.assign(heading.style, { margin: "0 0 12px", fontSize: "18px", color: "#164d63", overflowWrap: "anywhere" });
  const body = document.createElement("p");
  body.textContent = text || "مستند تجريبي.";
  Object.assign(body.style, { margin: "0 0 16px", whiteSpace: "pre-line", lineHeight: "1.7" });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "إغلاق";
  Object.assign(closeBtn.style, {
    border: "0", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontWeight: "700",
    background: "#164d63", color: "#fff", fontFamily: "inherit", fontSize: "15px",
  });
  const close = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  card.append(heading, body, closeBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey);
  closeBtn.focus();
};

// Opens or saves a file from memory; the server checked the permission and no
// public link ever exists.
export const openBlob = (blob, name, { download }) => {
  if (isDemo()) {
    showDemoDocument(blob, name);
    return;
  }
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
