import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorText, getPermissions, savePermissions } from "../api";
import { fillText, leafName, moduleName, perms, roleLabel } from "../strings";
import {
  diffSummary, effectiveOf, isLeafEditable, isModuleGrantable, isResettable, leavesOf, moduleState, sourceOf, toggleKey, toggleModule, visibleModules,
} from "./permissionTree";
import ConfirmDialog from "./ConfirmDialog.jsx";
import styles from "./PermissionsEditor.module.css";

const SOURCE_TONE = { role: "info", granted: "success", revoked: "danger" };

// Checkbox with a third, "partly on" state.
function TriStateBox({ state, ...rest }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "some"; }, [state]);
  return <input ref={ref} type="checkbox" checked={state === "all"} {...rest} />;
}

const permissionError = (res) => errorText(res, perms.errors);

// Permissions of one user (permissions.manage). Rows the signed-in manager
// may not grant are disabled; the server checks every change again.
// Copied from the everyday app's PermissionsTab and adapted to /api/it.
export default function PermissionsEditor({ tz, onSaved }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ grants: [], revokes: [] });
  const [open, setOpen] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(null); // { title, message, run }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPermissions(tz);
    setLoading(false);
    if (!res.ok) { setError(permissionError(res) || perms.loadFailed); return; }
    setError("");
    setData(res.data);
    setDraft({ grants: res.data.grants || [], revokes: res.data.revokes || [] });
  }, [tz]);

  useEffect(() => { load(); }, [load]);

  const grantable = useMemo(() => data?.grantable || [], [data]);
  const editable = grantable.length > 0;
  const state = useMemo(() => ({ defaults: data?.defaults || [], ...draft }), [data, draft]);
  const effective = useMemo(() => effectiveOf(state), [state]);
  const savedEffective = useMemo(() => data?.effective || [], [data]);

  if (loading && !data) return <p>…</p>;
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!data) return null;

  const keyLabel = (key) => `${moduleName(key.split(".")[0])}: ${leafName(key)}`;

  const persist = async (next) => {
    setSaving(true);
    setMessage("");
    const res = await savePermissions(tz, next);
    setSaving(false);
    if (!res.ok) return setMessage(permissionError(res));
    setMessage(perms.saved);
    setData((prev) => ({ ...prev, grants: res.data.grants, revokes: res.data.revokes, effective: res.data.effective, updatedAt: res.data.updatedAt, updatedBy: res.data.updatedBy }));
    setDraft({ grants: res.data.grants || [], revokes: res.data.revokes || [] });
    onSaved?.();
  };

  const onSave = () => {
    const { added, removed } = diffSummary(savedEffective, effective);
    if (added.length === 0 && removed.length === 0) {
      // Grants that only repeat role defaults change nothing visible; still save them.
      const same = JSON.stringify(draft) === JSON.stringify({ grants: data.grants || [], revokes: data.revokes || [] });
      if (same) return setMessage(perms.noChanges);
    }
    setConfirm({
      title: perms.saveTitle,
      message: (
        <>
          {added.length > 0 && <><strong>{perms.added}:</strong> {added.map(keyLabel).join("، ")}<br /></>}
          {removed.length > 0 && <><strong>{perms.removed}:</strong> {removed.map(keyLabel).join("، ")}</>}
          {added.length === 0 && removed.length === 0 && perms.noChanges}
        </>
      ),
      confirmText: perms.save,
      run: () => persist(draft),
    });
  };

  const onReset = () => setConfirm({
    title: perms.reset,
    message: perms.resetConfirm,
    confirmText: perms.confirm,
    run: () => persist({ grants: [], revokes: [] }),
  });

  const toggleOpen = (module) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(module)) next.delete(module); else next.add(module);
    return next;
  });

  const who = data.updatedBy === "system" ? perms.system : data.updatedBy;
  const lastChange = data.updatedAt
    ? fillText(perms.lastChange, { who: who || "—", when: new Date(data.updatedAt).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) })
    : perms.neverChanged;
  const hasSpecial = (data.grants || []).length > 0 || (data.revokes || []).length > 0;
  const canReset = isResettable(data, grantable);

  return (
    <section className={styles.tab} aria-label={perms.title}>
      <header className={styles.head}>
        <div><strong>{perms.role}:</strong> {data.role ? roleLabel(data.role) : perms.noRole}</div>
        <small>{lastChange}</small>
        {!editable && <small className={styles.note}>{perms.readOnly}</small>}
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
                <label className={styles.switch} title={editable && !moduleEnabled ? perms.notGrantable : undefined}>
                  <TriStateBox
                    state={mState}
                    disabled={!moduleEnabled || saving}
                    onChange={() => setDraft(toggleModule(state, module, mState !== "all"))}
                  />
                  <span className={styles.moduleName}>{moduleName(module)}</span>
                </label>
                <span className={styles.stateText}>{perms.state[mState]}</span>
                <button
                  type="button"
                  className={styles.expand}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? perms.closeOps : perms.openOps}
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
                        <label title={editable && !allowed ? perms.notGrantable : undefined} className={allowed ? "" : styles.disabled}>
                          <input
                            type="checkbox"
                            checked={effective.includes(key)}
                            disabled={!allowed || saving}
                            onChange={(e) => setDraft(toggleKey(state, key, e.target.checked))}
                          />
                          {leafName(key)}
                        </label>
                        {SOURCE_TONE[source] && <span className={`badge ${SOURCE_TONE[source]}`}>{perms.source[source]}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {message && <p role="status">{message}</p>}
      {editable && (
        <div className={styles.actions}>
          <button type="button" className="primary" onClick={onSave} disabled={saving}>{perms.save}</button>
          <span title={hasSpecial && !canReset ? perms.notGrantable : undefined}>
            <button type="button" onClick={onReset} disabled={saving || !hasSpecial || !canReset}>{perms.reset}</button>
          </span>
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          cancelText={perms.cancel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }}
        />
      )}
    </section>
  );
}
