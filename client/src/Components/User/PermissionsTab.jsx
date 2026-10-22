import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUserPermissions, saveUserPermissions } from "../../WebServer/services/user/functionsUser.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import { fillText } from "../../utils/vehicleDisplay";
import { ROLE_LABEL_KEY } from "../../utils/roles";
import {
  diffSummary, effectiveOf, isLeafEditable, isModuleGrantable, isResettable, leavesOf, moduleState, sourceOf, toggleKey, toggleModule, visibleModules,
} from "../../utils/permissionTree";
import { permissionError } from "./RolePickerDialog.jsx";
import styles from "./PermissionsTab.module.css";

const SOURCE_TONE = { role: "info", granted: "success", revoked: "danger" };

// Checkbox with a third, "partly on" state.
function TriStateBox({ state, ...rest }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "some"; }, [state]);
  return <input ref={ref} type="checkbox" checked={state === "all"} {...rest} />;
}

const safeAsk = async (options) => {
  try { return await ask("change", options); } catch { return false; }
};

// Permissions of one user (permissions.manage). Rows the signed-in manager
// may not grant are disabled; the server checks every change again.
export default function PermissionsTab({ tz }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ grants: [], revokes: [] });
  const [open, setOpen] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getUserPermissions(tz);
    setLoading(false);
    if (!res.ok) { setError(permissionError(t, res) || t("perms.loadFailed")); return; }
    setError("");
    setData(res);
    setDraft({ grants: res.grants || [], revokes: res.revokes || [] });
  }, [tz, t]);

  useEffect(() => { load(); }, [load]);

  const grantable = useMemo(() => data?.grantable || [], [data]);
  const editable = grantable.length > 0;
  const state = useMemo(() => ({ defaults: data?.defaults || [], ...draft }), [data, draft]);
  const effective = useMemo(() => effectiveOf(state), [state]);
  const savedEffective = useMemo(() => data?.effective || [], [data]);

  if (loading && !data) return <p>…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!data) return null;

  const keyLabel = (key) => {
    const [module, leaf] = key.split(".");
    return `${t(`perms.modules.${module}`, module)}: ${t(`perms.leaves.${leaf}`, leaf)}`;
  };

  const persist = async (next, successText) => {
    setSaving(true);
    const res = await saveUserPermissions(tz, next);
    setSaving(false);
    if (!res.ok) return toast.warn(permissionError(t, res));
    toast.success(successText);
    setData((prev) => ({ ...prev, grants: res.grants, revokes: res.revokes, effective: res.effective, updatedAt: res.updatedAt, updatedBy: res.updatedBy }));
    setDraft({ grants: res.grants || [], revokes: res.revokes || [] });
  };

  const onSave = async () => {
    const { added, removed } = diffSummary(savedEffective, effective);
    if (added.length === 0 && removed.length === 0) {
      // Grants that only repeat role defaults change nothing visible; still save them.
      const same = JSON.stringify(draft) === JSON.stringify({ grants: data.grants || [], revokes: data.revokes || [] });
      if (same) return toast.info(t("perms.noChanges"));
    }
    const message = (
      <>
        {added.length > 0 && <><strong>{t("perms.added")}:</strong> {added.map(keyLabel).join("، ")}<br /></>}
        {removed.length > 0 && <><strong>{t("perms.removed")}:</strong> {removed.map(keyLabel).join("، ")}</>}
        {added.length === 0 && removed.length === 0 && t("perms.noChanges")}
      </>
    );
    const ok = await safeAsk({ title: t("perms.saveTitle"), message, confirmText: t("perms.save"), cancelText: t("perms.cancel") });
    if (ok) persist(draft, t("perms.saved"));
  };

  const onReset = async () => {
    const ok = await safeAsk({ title: t("perms.reset"), message: t("perms.resetConfirm"), confirmText: t("perms.confirm"), cancelText: t("perms.cancel") });
    if (ok) persist({ grants: [], revokes: [] }, t("perms.saved"));
  };

  const toggleOpen = (module) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(module)) next.delete(module); else next.add(module);
    return next;
  });

  const who = data.updatedBy === "system" ? t("perms.system") : data.updatedBy;
  const lastChange = data.updatedAt
    ? fillText(t("perms.lastChange"), { who: who || "—", when: new Date(data.updatedAt).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) })
    : t("perms.neverChanged");
  const hasSpecial = (data.grants || []).length > 0 || (data.revokes || []).length > 0;
  const canReset = isResettable(data, grantable);

  return (
    <section className={styles.tab} aria-label={t("perms.title")}>
      <header className={styles.head}>
        <div>
          <strong>{t("perms.role")}:</strong> {data.role ? t(ROLE_LABEL_KEY[data.role], data.role) : t("perms.noRole")}
        </div>
        <small>{lastChange}</small>
        {!editable && <small className={styles.note}>{t("perms.readOnly")}</small>}
      </header>

      <ul className={styles.modules}>
        {visibleModules().map((module) => {
          const mState = moduleState(module, effective);
          const moduleEnabled = editable && isModuleGrantable(module, grantable);
          const isOpen = open.has(module);
          // A saved bare module key can only be changed by someone who may grant the whole module.
          const leavesEditable = isLeafEditable(module, data, grantable);
          return (
            <li key={module} className={styles.module}>
              <div className={styles.moduleRow}>
                <label className={styles.switch} title={editable && !moduleEnabled ? t("perms.notGrantable") : undefined}>
                  <TriStateBox
                    state={mState}
                    disabled={!moduleEnabled || saving}
                    onChange={() => setDraft(toggleModule(state, module, mState !== "all"))}
                  />
                  <span className={styles.moduleName}>{t(`perms.modules.${module}`, module)}</span>
                </label>
                <span className={styles.stateText}>{t(`perms.state.${mState}`)}</span>
                <button
                  type="button"
                  className={styles.expand}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? t("perms.closeOps") : t("perms.openOps")}
                  onClick={() => toggleOpen(module)}
                >
                  {isOpen ? "▴" : "▾"}
                </button>
              </div>
              {isOpen && (
                <ul className={styles.leaves}>
                  {leavesOf(module).map((key) => {
                    const allowed = editable && leavesEditable && grantable.includes(key);
                    const source = sourceOf(key, state);
                    return (
                      <li key={key} className={styles.leafRow}>
                        <label title={editable && !allowed ? t("perms.notGrantable") : undefined} className={allowed ? "" : styles.disabled}>
                          <input
                            type="checkbox"
                            checked={effective.includes(key)}
                            disabled={!allowed || saving}
                            onChange={(e) => setDraft(toggleKey(state, key, e.target.checked))}
                          />
                          {t(`perms.leaves.${key.split(".")[1]}`, key)}
                        </label>
                        {SOURCE_TONE[source] && <StatusBadge tone={SOURCE_TONE[source]}>{t(`perms.source.${source}`)}</StatusBadge>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <div className={styles.actions}>
          <Button onClick={onSave} loading={saving}>{t("perms.save")}</Button>
          <span title={hasSpecial && !canReset ? t("perms.notGrantable") : undefined}>
            <Button variant="secondary" onClick={onReset} disabled={saving || !hasSpecial || !canReset}>{t("perms.reset")}</Button>
          </span>
        </div>
      )}
    </section>
  );
}
