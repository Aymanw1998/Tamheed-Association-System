import React, { useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import { createSport, deleteSport, updateSport } from "../../WebServer/services/sport/functionsSport";
import { MAX_STATS, validateSport } from "./sportForm";
import styles from "./Sport.module.css";

const EMPTY = { name: "", icon: "", stats: [] };

export default function SportsTab({ sports, reload }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(null); // null | "new" | sport id
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const open = (sport) => {
    setEditing(sport ? sport._id : "new");
    // Existing keys travel with the stats so the server keeps them; the order is kept too.
    setForm(sport ? { name: sport.name, icon: sport.icon || "", stats: (sport.stats || []).map((s) => ({ ...s })) } : EMPTY);
    setErrors({});
  };
  const close = () => setEditing(null);

  const setStat = (index, label) =>
    setForm((f) => ({ ...f, stats: f.stats.map((s, i) => (i === index ? { ...s, label } : s)) }));

  const submit = async (event) => {
    event.preventDefault();
    const found = validateSport(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const payload = { name: form.name.trim(), icon: form.icon.trim(), stats: form.stats.map((s) => ({ ...s, label: s.label.trim() })) };
    const res = editing === "new" ? await createSport(payload) : await updateSport(editing, payload);
    setBusy(false);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.saved"));
    close();
    reload();
  };

  const remove = async (sport) => {
    const confirmed = await ask("delete", { title: t("sport.deleteTitle"), message: t("sport.sports.deleteConfirm") }).catch(() => false);
    if (!confirmed) return;
    const res = await deleteSport(sport._id);
    if (!res.ok) return toast.warn(res.message);
    toast.success(t("sport.deleted"));
    reload();
  };

  return (
    <section className={styles.group}>
      <div className={styles.toolbar}>
        <Button onClick={() => open(null)}>{t("sport.sports.add")}</Button>
      </div>
      {editing && (
        <form className={styles.form} onSubmit={submit} noValidate>
          <h3>{editing === "new" ? t("sport.sports.add") : t("sport.sports.editTitle")}</h3>
          <div className={styles.field}>
            <label htmlFor="sport-name">{t("sport.sports.name")}</label>
            <input id="sport-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {errors.name && <span className={styles.error}>{errors.name}</span>}
          </div>
          <div className={styles.field}>
            <label htmlFor="sport-icon">{t("sport.sports.icon")}</label>
            <input id="sport-icon" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            {errors.icon && <span className={styles.error}>{errors.icon}</span>}
          </div>
          <div className={`${styles.field} ${styles.wide}`}>
            <span>{t("sport.sports.stats")}</span>
            {form.stats.map((stat, index) => (
              <div className={styles.statRow} key={stat.key || `new-${index}`}>
                <input aria-label={t("sport.sports.statLabel")} placeholder={t("sport.sports.statLabel")} value={stat.label} onChange={(e) => setStat(index, e.target.value)} />
                <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, stats: f.stats.filter((_, i) => i !== index) }))}>{t("sport.sports.removeStat")}</Button>
              </div>
            ))}
            {errors.stats && <span className={styles.error}>{errors.stats}</span>}
            {form.stats.length < MAX_STATS && (
              <div><Button variant="secondary" size="sm" onClick={() => setForm((f) => ({ ...f, stats: [...f.stats, { label: "" }] }))}>{t("sport.sports.addStat")}</Button></div>
            )}
          </div>
          <div className={`${styles.actions} ${styles.wide}`}>
            <Button type="submit" loading={busy}>{t("sport.save")}</Button>
            <Button variant="secondary" onClick={close}>{t("sport.cancel")}</Button>
          </div>
        </form>
      )}
      {sports.length === 0 ? (
        <div className={styles.state}>{t("sport.sports.empty")}</div>
      ) : (
        <ul className={styles.list}>
          {sports.map((sport) => (
            <li key={sport._id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{sport.icon} {sport.name}</span>
                <span className={styles.muted}>{(sport.stats || []).length} {t("sport.sports.statsCount")}: {(sport.stats || []).map((s) => s.label).join("، ")}</span>
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" size="sm" onClick={() => open(sport)}>{t("sport.edit")}</Button>
                <Button variant="danger" size="sm" onClick={() => remove(sport)}>{t("sport.remove")}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
