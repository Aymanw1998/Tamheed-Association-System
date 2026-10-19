import React from "react";
import { useI18n } from "../../i18n/I18nContext";
import { changeRows } from "../../utils/auditDisplay";
import { fillText } from "../../utils/vehicleDisplay";
import styles from "./Audit.module.css";

// Audit rows: time, actor, module, action, target and the field changes.
// `studentNames` (Map id -> name) turns lesson roster ids into names.
export default function AuditTable({ items, studentNames, compact = false }) {
  const { t, language } = useI18n();
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {["at", "actor", ...(compact ? [] : ["module"]), "action", ...(compact ? [] : ["target"]), "changes"].map((c) => (
              <th key={c} scope="col">{t(`audit.cols.${c}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const rows = changeRows(row.changes, { studentNames });
            return (
              <tr key={row._id || `${row.at}-${row.targetId}-${row.action}`}>
                <td className={styles.nowrap}>{row.at ? new Date(row.at).toLocaleString(language, { timeZone: "Asia/Jerusalem" }) : "—"}</td>
                <td>{row.actor === "system" ? t("audit.system") : (row.actorName || row.actor || "—")}</td>
                {!compact && <td>{t(`perms.modules.${row.module}`, row.module)}</td>}
                <td>{t(`audit.actions.${row.action}`, row.action)}</td>
                {!compact && <td>{row.targetLabel || row.targetId || "—"}</td>}
                <td>
                  {rows.length === 0 ? "—" : (
                    <details>
                      <summary>{fillText(t("audit.fields"), { n: rows.length })}</summary>
                      <table className={styles.changes}>
                        <thead>
                          <tr><th>{t("audit.field")}</th><th>{t("audit.before")}</th><th>{t("audit.after")}</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((c) => (
                            <tr key={c.field}><td>{c.field}</td><td>{c.before}</td><td>{c.after}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
