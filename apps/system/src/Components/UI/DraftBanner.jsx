import React from "react";
import { formatDateTime } from "../../generated/dateFormat";
import Button from "./Button";
import Icon from "./Icon";
import styles from "./DraftBanner.module.css";

// "You have unsaved changes from <time>": restore them or discard (useFormDraft).
export default function DraftBanner({ draft, onRestore, onDiscard }) {
  if (!draft) return null;
  return (
    <div className={styles.banner} role="status">
      <span className={styles.icon}><Icon name="save" size={20} /></span>
      <span className={styles.text}>
        <strong>يوجد تعديل لم يُحفظ</strong>
        <small>من <time dir="ltr">{formatDateTime(new Date(draft.at).toISOString())}</time>. هل تريد استعادته؟</small>
      </span>
      <span className={styles.actions}>
        <Button size="sm" onClick={onRestore}>استعادة</Button>
        <Button size="sm" variant="secondary" onClick={onDiscard}>تجاهل</Button>
      </span>
    </div>
  );
}
