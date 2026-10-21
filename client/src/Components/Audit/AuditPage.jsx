import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getAudit } from "../../WebServer/services/audit/functionsAudit.jsx";
import { getAll as getStudents } from "../../WebServer/services/student/functionsStudent.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "../../i18n/accessStrings";
import { toast } from "../../ALERT/SystemToasts.jsx";
import Button from "../UI/Button.jsx";
import { canStored } from "../../utils/session";
import { auditQuery } from "../../utils/auditDisplay";
import { fillText } from "../../utils/vehicleDisplay";
import AuditTable from "./AuditTable.jsx";
import styles from "./Audit.module.css";

const PAGE_SIZE = 50;
const EMPTY = { from: "", to: "", module: "", actor: "", action: "", targetId: "", q: "" };

// Student id -> name, fetched once, only for viewers who may list students;
// everyone else sees the ids.
function useStudentNames() {
  const [names, setNames] = useState(null);
  useEffect(() => {
    if (!canStored("students.view")) return undefined;
    let alive = true;
    getStudents().then((res) => {
      if (!alive || !res?.ok) return;
      const map = new Map();
      for (const s of res.students || []) {
        const name = `${s.firstname || ""} ${s.lastname || ""}`.trim();
        if (name && s._id) map.set(String(s._id), name);
      }
      setNames(map);
    });
    return () => { alive = false; };
  }, []);
  return names;
}

// Change log (audit.view): newest first, 50 per page.
export default function AuditPage() {
  const { t } = useI18n();
  // "Open the full log" on an edit page passes its record in router state, so
  // no ID number ends up in the address bar.
  const location = useLocation();
  const initial = { ...EMPTY, targetId: String(location.state?.targetId || "") };
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, items: [], total: 0, error: "" });
  const studentNames = useStudentNames();

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    const res = await getAudit(auditQuery(applied, page));
    if (!res.ok) {
      const error = res.code === "BAD_DATE" ? t("audit.badDate") : (res.message || t("audit.loadFailed"));
      if (res.code === "BAD_DATE") toast.warn(error);
      setState({ loading: false, items: [], total: 0, error });
      return;
    }
    setState({ loading: false, items: res.items || [], total: res.total || 0, error: "" });
  }, [applied, page, t]);

  useEffect(() => { load(); }, [load]);

  const set = (key) => (e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }));
  const apply = (e) => { e.preventDefault(); setPage(1); setApplied(draft); };
  const clear = () => { setDraft(EMPTY); setPage(1); setApplied(EMPTY); };
  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

  return (
    <section className={styles.page}>
      <h1>{t("audit.title")}</h1>

      <form className={styles.filters} data-tour="audit-filters" onSubmit={apply}>
        <label>{t("audit.filters.from")}<input type="date" value={draft.from} onChange={set("from")} /></label>
        <label>{t("audit.filters.to")}<input type="date" value={draft.to} onChange={set("to")} /></label>
        <label>{t("audit.filters.module")}
          <select value={draft.module} onChange={set("module")}>
            <option value="">{t("audit.filters.all")}</option>
            {AUDIT_MODULES.map((m) => <option key={m} value={m}>{t(`perms.modules.${m}`, m)}</option>)}
          </select>
        </label>
        <label>{t("audit.filters.action")}
          <select value={draft.action} onChange={set("action")}>
            <option value="">{t("audit.filters.all")}</option>
            {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{t(`audit.actions.${a}`, a)}</option>)}
          </select>
        </label>
        <label>{t("audit.filters.actor")}<input value={draft.actor} onChange={set("actor")} inputMode="numeric" /></label>
        {draft.targetId && (
          <label>{t("audit.filters.targetId")}<input value={draft.targetId} onChange={set("targetId")} /></label>
        )}
        <label data-tour="audit-search">{t("audit.filters.q")}<input type="search" value={draft.q} maxLength={100} onChange={set("q")} /></label>
        <Button type="submit" loading={state.loading}>{t("audit.filters.apply")}</Button>
        <Button variant="secondary" data-tour="audit-clear" onClick={clear}>{t("audit.filters.clear")}</Button>
      </form>

      {state.error && <p role="alert">{state.error}</p>}
      {!state.loading && !state.error && state.items.length === 0 && <p>{t("audit.empty")}</p>}
      {state.items.length > 0 && <div data-tour="audit-table"><AuditTable items={state.items} studentNames={studentNames} /></div>}

      {state.total > 0 && (
        <div className={styles.pager} data-tour="audit-pager">
          <span>{fillText(t("audit.total"), { n: state.total })}</span>
          <Button size="sm" variant="secondary" disabled={page <= 1 || state.loading} onClick={() => setPage(page - 1)}>{t("audit.prev")}</Button>
          <span>{fillText(t("audit.page"), { page, pages })}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages || state.loading} onClick={() => setPage(page + 1)}>{t("audit.next")}</Button>
        </div>
      )}
    </section>
  );
}
