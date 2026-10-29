import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import { createNotice, deleteNotice, getNotices } from "../../WebServer/services/sport/functionsSport";
import { DAY_NAMES } from "../../utils/lessonSchedule";
import useLiveRefresh from "../../locks/useLiveRefresh";
import styles from "./Sport.module.css";

const TITLE_MAX = 80;
const BODY_MAX = 1000;
const EMPTY = { title: "", body: "", lessonId: "", expiresOn: "" };
const dateLabel = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB");
};

// Notices to the players: posted here (coach or manager), shown on the sport
// site, and pushed to the phones of the players they reach.
export default function NoticesTab({ lessons, canCoach }) {
  const { t, dir } = useI18n();
  const label = (key) => t(`sport.notices.${key}`);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getNotices();
    if (res.ok) setNotices(res.notices || []);
    else toast.warn(res.message);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(["sportNotice"], load);

  const lessonOptions = useMemo(
    () => [...lessons].sort((a, b) => a.date.day - b.date.day || a.date.startMin - b.date.startMin),
    [lessons],
  );
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setError(label("titleRequired"));
    setError("");
    setBusy(true);
    const res = await createNotice({
      title: form.title, body: form.body, lessonId: form.lessonId || null, expiresOn: form.expiresOn || null,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    toast.success(label("posted"));
    setForm(EMPTY);
    load();
  };

  const remove = async (notice) => {
    const confirmed = await ask("delete", {
      title: label("deleteTitle"), message: label("deleteConfirm"), confirmText: label("deleteOk"),
    }).catch(() => false);
    if (!confirmed) return;
    const res = await deleteNotice(notice._id);
    if (!res.ok) return toast.warn(res.message);
    toast.success(label("deleted"));
    load();
  };

  return (
    <div dir={dir}>
      {canCoach && (
        <form className={styles.noticeForm} onSubmit={submit} noValidate>
          <h2 className={styles.noticeFormTitle}>{label("new")}</h2>
          <div className={styles.fields}>
            <label className={`${styles.field} ${styles.wide}`}>
              {label("title")}
              <input value={form.title} onChange={set("title")} maxLength={TITLE_MAX} required />
            </label>
            <label className={`${styles.field} ${styles.wide}`}>
              {label("body")}
              <textarea value={form.body} onChange={set("body")} maxLength={BODY_MAX} rows={4} />
            </label>
            <label className={styles.field}>
              {label("audience")}
              <select value={form.lessonId} onChange={set("lessonId")}>
                <option value="">{label("everyone")}</option>
                {lessonOptions.map((l) => (
                  <option key={l._id} value={l._id}>{l.name || DAY_NAMES[l.date.day - 1]}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              {label("expiresOn")}
              <input type="date" value={form.expiresOn} onChange={set("expiresOn")} />
            </label>
          </div>
          <p className={styles.muted}>{label("pushHint")}</p>
          {error && <div className={styles.formError} role="alert">{error}</div>}
          <div className={styles.dialogActions}>
            <Button type="submit" loading={busy}>{label("post")}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.emptyState}>{t("sport.loading")}</div>
      ) : notices.length === 0 ? (
        <div className={styles.emptyState}>{label("empty")}</div>
      ) : (
        <ul className={styles.noticeList}>
          {notices.map((n) => (
            <li key={n._id} className={`${styles.noticeItem} ${n.expired ? styles.noticeExpired : ""}`}>
              <div className={styles.noticeHead}>
                <strong>{n.title}</strong>
                {canCoach && (
                  <Button size="sm" variant="ghost" onClick={() => remove(n)} aria-label={`${label("delete")}: ${n.title}`}>
                    {label("delete")}
                  </Button>
                )}
              </div>
              {n.body && <p className={styles.noticeBody}>{n.body}</p>}
              <p className={styles.muted}>
                {n.lessonName || label("everyone")} · {dateLabel(n.createdAt)}
                {n.createdBy ? ` · ${n.createdBy}` : ""}
                {n.expiresOn ? ` · ${n.expired ? label("expired") : label("until")} ${n.expiresOn.split("-").reverse().join("/")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
