import React, { useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import { setStats } from "../../WebServer/services/sport/functionsSport";
import { MAX_STATS, validateStats } from "./sportForm";
import styles from "./Sport.module.css";

export default function StatsSettingsTab({ sport, reload }) {
  const { t } = useI18n();
  // Existing stats keep their key so the server keeps their values.
  const [list, setList] = useState((sport?.stats || []).map((s) => ({ ...s })));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const label = (key) => t(`sport.settings.${key}`);

  const rename = (i, value) => setList((l) => l.map((s, j) => (j === i ? { ...s, label: value } : s)));
  const add = () => setList((l) => [...l, { label: "" }]);
  const move = (i, step) => setList((l) => {
    const j = i + step;
    if (j < 0 || j >= l.length) return l;
    const next = [...l];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = async (i) => {
    const confirmed = await ask("delete", {
      title: label("deleteTitle"), message: label("deleteConfirm"), confirmText: label("deleteOk"),
    }).catch(() => false);
    if (confirmed) setList((l) => l.filter((_, j) => j !== i));
  };

  const save = async () => {
    const found = validateStats(list);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const res = await setStats(list.map((s) => ({ ...s, label: s.label.trim() })));
    setBusy(false);
    if (!res.ok) return setErrors({ list: res.message });
    toast.success(t("sport.saved"));
    reload();
  };

  return (
    <div className={styles.settings}>
      <p className={styles.summary}>{label("intro")}</p>
      {list.length === 0 && <div className={styles.emptyState}>{label("empty")}</div>}
      <ul className={styles.statList}>
        {list.map((s, i) => (
          <li key={s.key || `new-${i}`} className={styles.statItem}>
            <input
              value={s.label}
              maxLength={40}
              placeholder={label("label")}
              aria-label={label("label")}
              onChange={(e) => rename(i, e.target.value)}
            />
            <Button size="sm" variant="secondary" disabled={i === 0} aria-label={label("up")} onClick={() => move(i, -1)}>↑</Button>
            <Button size="sm" variant="secondary" disabled={i === list.length - 1} aria-label={label("down")} onClick={() => move(i, 1)}>↓</Button>
            <Button size="sm" variant="danger" onClick={() => remove(i)}>{label("delete")}</Button>
            {errors[i] && <span className={styles.error} role="alert">{errors[i]}</span>}
          </li>
        ))}
      </ul>
      {errors.list && <div className={styles.formError} role="alert">{errors.list}</div>}
      <div className={styles.rowActions}>
        <Button variant="secondary" disabled={list.length >= MAX_STATS} onClick={add}>{label("add")}</Button>
        <Button loading={busy} onClick={save}>{t("sport.save")}</Button>
      </div>
    </div>
  );
}
