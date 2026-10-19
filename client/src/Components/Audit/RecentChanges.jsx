import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAudit } from "../../WebServer/services/audit/functionsAudit.jsx";
import { useI18n } from "../../i18n/I18nContext";
import AuditTable from "./AuditTable.jsx";
import styles from "./Audit.module.css";

const LIMIT = 10;

// Last 10 audit rows of one record (audit.view). A record may have been
// logged under more than one id (students: _id, older rows: tz).
export default function RecentChanges({ targetIds }) {
  const { t } = useI18n();
  const ids = [...new Set((targetIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const key = ids.join("|");
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    Promise.all(key.split("|").map((targetId) => getAudit({ targetId, page: 1 }))).then((results) => {
      if (!alive) return;
      const rows = results.flatMap((res) => (res.ok ? res.items || [] : []));
      rows.sort((a, b) => new Date(b.at) - new Date(a.at));
      setItems(rows.slice(0, LIMIT));
    });
    return () => { alive = false; };
  }, [key]);

  if (!key || items === null) return null;
  return (
    <section className={styles.panel} aria-label={t("audit.recent")}>
      <div className={styles.panelHead}>
        <h2>{t("audit.recent")}</h2>
        <Link to="/audit" state={{ targetId: ids[0] }}>{t("audit.openAll")}</Link>
      </div>
      {items.length === 0 ? <p>{t("audit.empty")}</p> : <AuditTable items={items} compact />}
    </section>
  );
}
