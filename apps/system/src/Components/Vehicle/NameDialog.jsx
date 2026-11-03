import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import Button from "../UI/Button.jsx";
import styles from "./Vehicle.module.css";

// Small window asking for a file's display name (optional). Used when attaching
// a file and when renaming one. Enter confirms, Escape cancels.
export default function NameDialog({ heading, fileLabel, initial = "", confirmLabel, busy = false, onConfirm, onCancel }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (event) => event.key === "Escape" && !busy && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const submit = (event) => {
    event.preventDefault();
    onConfirm(value.trim());
  };

  return (
    <div className={styles.modalBackdrop} onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="name-dialog-title" onSubmit={submit} noValidate>
        <strong id="name-dialog-title">{heading}</strong>
        {fileLabel && <span className={styles.fieldHint} dir="auto">{fileLabel}</span>}
        <div className={styles.field}>
          <label htmlFor="name-dialog-input">{t("vehicles.fileName")}</label>
          <input
            id="name-dialog-input"
            ref={inputRef}
            value={value}
            maxLength={100}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("vehicles.fileNameHint")}
            autoComplete="off"
          />
        </div>
        <div className={styles.actionsRow}>
          <Button type="submit" size="sm" loading={busy}>{confirmLabel}</Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onCancel}>{t("vehicles.cancel")}</Button>
        </div>
      </form>
    </div>
  );
}
