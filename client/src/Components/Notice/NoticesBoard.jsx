import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  archiveNotice, createNotice, getNotices, markAllNoticesRead, markNoticeRead, runVehicleCheck,
} from "../../WebServer/services/notice/functionsNotice.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import { ask } from "../Provides/confirmBus";
import { fillText } from "../../utils/vehicleDisplay";
import styles from "./Notice.module.css";

const TONE = { critical: "danger", important: "warning", info: "neutral" };
const notifyChanged = () => window.dispatchEvent(new Event("NOTICES_CHANGED"));
const emptyDraft = { title: "", body: "", severity: "info" };

export default function NoticesBoard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: "all", category: "", severity: "" });
  const [state, setState] = useState({ loading: true, notices: [], error: "" });
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await getNotices(filters);
    setState(res.ok ? { loading: false, notices: res.notices || [], error: "" } : { loading: false, notices: [], error: res.message });
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, success) => {
    setBusy(key);
    const res = await fn();
    setBusy("");
    if (!res.ok) return toast.warn(res.message);
    if (success) toast.success(typeof success === "function" ? success(res) : success);
    notifyChanged();
    return load();
  };

  const open = async (notice) => {
    if (!notice.read) await markNoticeRead(notice._id).then(notifyChanged);
    if (notice.link) navigate(notice.link);
    else load();
  };

  const publish = async (event) => {
    event.preventDefault();
    setBusy("publish");
    const res = await createNotice(draft);
    setBusy("");
    if (!res.ok) { setErrors(res.errors || {}); return toast.warn(res.message); }
    setDraft(emptyDraft);
    setErrors({});
    toast.success(t("notices.published"));
    notifyChanged();
    load();
  };

  const archive = async (notice) => {
    let ok = false;
    try {
      ok = await ask("change", { title: t("notices.archive"), message: t("notices.archiveConfirm") });
    } catch {
      ok = false;
    }
    if (ok) act(`a${notice._id}`, () => archiveNotice(notice._id));
  };

  const setFilter = (key) => (event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <h1>{t("notices.title")}</h1>
        <div className={styles.actions} data-tour="notices-actions">
          <Button size="sm" variant="secondary" data-tour="notices-mark-all" loading={busy === "all"} onClick={() => act("all", markAllNoticesRead)}>{t("notices.markAll")}</Button>
          <Button size="sm" variant="secondary" data-tour="notices-run-check" loading={busy === "run"}
            onClick={() => act("run", runVehicleCheck, (res) => fillText(t("notices.runDone"), { n: res.created || 0 }))}>
            {t("notices.runCheck")}
          </Button>
        </div>
      </header>

      <div className={styles.filters} data-tour="notices-filters">
        <select value={filters.status} onChange={setFilter("status")} aria-label={t("notices.filters.status")}>
          <option value="all">{t("notices.filters.all")}</option>
          <option value="unread">{t("notices.filters.unread")}</option>
        </select>
        <select value={filters.category} onChange={setFilter("category")} aria-label={t("notices.filters.category")}>
          <option value="">{t("notices.filters.category")}</option>
          {["vehicle", "system", "manual"].map((c) => <option key={c} value={c}>{t(`notices.category.${c}`)}</option>)}
        </select>
        <select value={filters.severity} onChange={setFilter("severity")} aria-label={t("notices.filters.severity")}>
          <option value="">{t("notices.filters.severity")}</option>
          {["critical", "important", "info"].map((s) => <option key={s} value={s}>{t(`notices.severity.${s}`)}</option>)}
        </select>
      </div>

      {state.error && <p role="alert">{state.error}</p>}
      {!state.loading && !state.error && state.notices.length === 0 && <p>{t("notices.empty")}</p>}

      {state.notices.length > 0 && (
        <div className={styles.tableWrap} data-tour="notices-list">
          <table className={styles.table}>
            <thead>
              <tr>
                {["severity", "title", "category", "date", "author", "status"].map((c) => <th key={c} scope="col">{t(`notices.cols.${c}`)}</th>)}
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {state.notices.map((n) => (
                <tr key={n._id} className={n.read ? "" : styles.unreadRow}>
                  <td><StatusBadge tone={TONE[n.severity]}>{t(`notices.severity.${n.severity}`)}</StatusBadge></td>
                  <td>
                    <button type="button" className={styles.linkButton} onClick={() => open(n)}>{n.title}</button>
                    {n.body && <div className={styles.body}>{n.body}</div>}
                  </td>
                  <td>{t(`notices.category.${n.category}`)}</td>
                  <td>{new Date(n.createdAt).toLocaleString("ar")}</td>
                  <td>{n.createdBy === "system" ? t("notices.system") : n.createdByName}</td>
                  <td>{n.read ? t("notices.read") : <strong>{t("notices.unread")}</strong>}</td>
                  <td className={styles.rowActions}>
                    {!n.read && <Button size="sm" variant="secondary" onClick={() => act(`r${n._id}`, () => markNoticeRead(n._id))}>{t("notices.markRead")}</Button>}
                    <Button size="sm" variant="secondary" data-tour="notices-archive" onClick={() => archive(n)}>{t("notices.archive")}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className={styles.form} data-tour="notices-publish" onSubmit={publish} noValidate>
        <h2>{t("notices.newTitle")}</h2>
        <label>{t("notices.f.title")}
          <input data-tour="notices-title" value={draft.title} maxLength={120} required onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          {errors.title && <span role="alert">{errors.title}</span>}
        </label>
        <label>{t("notices.f.body")}
          <textarea data-tour="notices-body" value={draft.body} maxLength={2000} rows={3} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          {errors.body && <span role="alert">{errors.body}</span>}
        </label>
        <label>{t("notices.f.severity")}
          <select data-tour="notices-severity" value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
            {["info", "important", "critical"].map((s) => <option key={s} value={s}>{t(`notices.severity.${s}`)}</option>)}
          </select>
        </label>
        <Button type="submit" data-tour="notices-submit" loading={busy === "publish"}>{t("notices.publish")}</Button>
      </form>
    </section>
  );
}
