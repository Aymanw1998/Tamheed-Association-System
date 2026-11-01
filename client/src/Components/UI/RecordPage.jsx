import React from "react";
import { useSearchParams } from "react-router-dom";
import Button from "./Button";
import { passportSrc } from "../../utils/passportPhoto";
import styles from "./RecordPage.module.css";

// A read-only record page (student, user, lesson): a card with the photo,
// name and the actions the viewer may use, and beside it (below on a phone)
// the record's tabs, one shown at a time. The open tab is kept in ?tab= so
// coming back from a linked page returns to it. With one tab there is no tab
// bar. `actions` ({ label, onClick, variant?, tour? }) are already filtered
// by permission; `tour` is the guided tour's data-tour name. photo={null} shows no
// photo box (a lesson); an empty photo shows a placeholder.
// facts ([label, value] pairs) show under the name, at a glance. Actions with
// variant "danger" (signing out, deleting) sit apart at the bottom of the card.
export default function RecordPage({ photo, title, subtitle, facts = [], actions = [], tabs = [], loading = false, error = "" }) {
  if (loading) return <div className={styles.page} dir="rtl"><p className={styles.status}>جارٍ التحميل…</p></div>;
  if (error) return <div className={styles.page} dir="rtl"><p className={styles.status} role="alert">{error}</p></div>;
  const safe = actions.filter((a) => a.variant !== "danger");
  const danger = actions.filter((a) => a.variant === "danger");

  return (
    <div className={styles.page} dir="rtl">
      <aside className={styles.card}>
        {photo !== null && <div className={styles.photo}>
          {photo
            ? <img src={passportSrc(photo)} alt="" />
            : <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
        </div>}
        <div className={styles.names}>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {facts.length > 0 && (
          <dl className={styles.facts} data-testid="record-facts">
            {facts.map(([label, value]) => (
              <div key={label} className={styles.fact}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        )}
        {safe.length > 0 && (
          <div className={styles.actions}>
            {safe.map((a, i) => (
              <Button key={a.label} variant={a.variant || (i === 0 ? "primary" : "secondary")} onClick={a.onClick} data-tour={a.tour}>{a.label}</Button>
            ))}
          </div>
        )}
        {danger.length > 0 && (
          <div className={styles.dangerZone} data-testid="danger-zone">
            {danger.map((a) => (
              <Button key={a.label} variant="danger" onClick={a.onClick} data-tour={a.tour}>{a.label}</Button>
            ))}
          </div>
        )}
      </aside>

      <section className={styles.body}>
        <RecordTabs tabs={tabs} />
      </section>
    </div>
  );
}

// The tabs alone (also used by the profile around its form). keepMounted keeps
// every tab's content in the page and hides the others, so a form in a tab
// keeps unsaved edits while another tab is open.
export function RecordTabs({ tabs = [], keepMounted = false }) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get("tab");
  const active = tabs.find((t) => t.id === wanted) || tabs[0];
  const open = (id) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  return (
    <>
        {tabs.length > 1 && (
          <div className={styles.tabs} role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === active?.id}
                className={`${styles.tab} ${t.id === active?.id ? styles.tabOn : ""}`}
                onClick={() => open(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {keepMounted
          ? tabs.map((t) => (
            <div key={t.id} className={styles.panel} role={tabs.length > 1 ? "tabpanel" : undefined} hidden={t.id !== active?.id}>{t.content}</div>
          ))
          : <div className={styles.panel} role={tabs.length > 1 ? "tabpanel" : undefined}>{active?.content}</div>}
    </>
  );
}
