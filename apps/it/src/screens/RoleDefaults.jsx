import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorText, getRoleDefaults, resetRoleDefaults, saveRoleDefaults } from "../api";
import { fillText, leafName, moduleName, perms, roleDefaultsText as text, roleLabel } from "../strings";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import { leavesOf, visibleModules } from "../ui/permissionTree";
import styles from "../ui/PermissionsEditor.module.css";
import { toast } from "../ui/toast.jsx";

const when = (value) => new Date(value).toLocaleString("ar", { timeZone: "Asia/Jerusalem" });

function TriStateBox({ state, ...rest }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "some"; }, [state]);
  return <input ref={ref} type="checkbox" checked={state === "all"} {...rest} />;
}

// «صلاحيات الأدوار»: which permissions each everyday role has by default.
// Any IT user; the server checks every key again (no IT key, no grant-only
// module). Only keys that may be defaults are shown.
export default function RoleDefaults() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [role, setRole] = useState("ادارة");
  const [draft, setDraft] = useState([]);
  const [open, setOpen] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const res = await getRoleDefaults();
    if (!res.ok) return setError(errorText(res));
    setData(res.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const current = data?.roles.find((r) => r.role === role);
  useEffect(() => { if (current) setDraft(current.defaults); }, [current]);

  const allowed = useMemo(() => new Set(data?.grantable || []), [data]);
  const modules = useMemo(
    () => visibleModules().filter((m) => leavesOf(m).some((key) => allowed.has(key))),
    [allowed],
  );

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!data || !current) return <p role="status">…</p>;

  const on = new Set(draft);
  const original = new Set(current.original);
  const saved = new Set(current.defaults);
  const leaves = (module) => leavesOf(module).filter((key) => allowed.has(key));
  const stateOf = (module) => {
    const list = leaves(module);
    const count = list.filter((key) => on.has(key)).length;
    return count === 0 ? "none" : count === list.length ? "all" : "some";
  };
  const setKeys = (keys, value) => {
    const next = new Set(on);
    for (const key of keys) if (value) next.add(key); else next.delete(key);
    setDraft([...next]);
  };
  const keyLabel = (key) => `${moduleName(key.split(".")[0])}: ${leafName(key)}`;
  const added = draft.filter((key) => !saved.has(key));
  const removed = current.defaults.filter((key) => !on.has(key));
  const changed = added.length > 0 || removed.length > 0;

  const apply = (res, okText) => {
    if (!res.ok) return toast.error(errorText(res, text.errors));
    toast.success(okText);
    setData((prev) => ({ ...prev, roles: prev.roles.map((r) => (r.role === role ? res.data.role : r)) }));
  };

  const onSave = () => setConfirm({
    title: fillText(text.saveTitle, { role: roleLabel(role) }),
    message: (
      <>
        {added.length > 0 && <><strong>{perms.added}:</strong> {added.map(keyLabel).join("، ")}<br /></>}
        {removed.length > 0 && <><strong>{perms.removed}:</strong> {removed.map(keyLabel).join("، ")}<br /></>}
        {fillText(text.saveAffects, { count: current.users })}
      </>
    ),
    confirmText: text.save,
    run: async () => {
      setSaving(true);
      const res = await saveRoleDefaults(role, draft);
      setSaving(false);
      apply(res, text.saved);
    },
  });

  const onReset = () => setConfirm({
    title: text.resetTitle,
    message: fillText(text.resetConfirm, { role: roleLabel(role), count: current.users }),
    confirmText: perms.confirm,
    run: async () => {
      setSaving(true);
      const res = await resetRoleDefaults(role);
      setSaving(false);
      apply(res, text.resetDone);
    },
  });

  const toggleOpen = (module) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(module)) next.delete(module); else next.add(module);
    return next;
  });

  return (
    <section>
      <h1>{text.title}</h1>
      <p className="muted">{text.intro}</p>

      <div className="row role-tabs" role="tablist" aria-label="الأدوار">
        {data.roles.map((r) => (
          <button
            key={r.role}
            type="button"
            role="tab"
            aria-selected={r.role === role}
            className={r.role === role ? "primary" : ""}
            onClick={() => setRole(r.role)}
          >
            {roleLabel(r.role)}
            {r.custom && <span className="badge warning">{text.custom}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        <header className={styles.head}>
          <div><strong>{roleLabel(role)}</strong> · {fillText(text.users, { count: current.users })}</div>
          <small>{current.custom && current.updatedAt
            ? fillText(text.lastChange, { who: current.updatedBy || "—", when: when(current.updatedAt) })
            : text.original}</small>
        </header>

        <ul className={styles.modules}>
          {modules.map((module) => {
            const mState = stateOf(module);
            const isOpen = open.has(module);
            return (
              <li key={module} className={styles.module} data-module={module}>
                <div className={styles.moduleRow}>
                  <label className={styles.switch}>
                    <TriStateBox
                      state={mState}
                      disabled={saving}
                      aria-label={moduleName(module)}
                      onChange={() => setKeys(leaves(module), mState !== "all")}
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
                    {leaves(module).map((key) => (
                      <li key={key} className={styles.leafRow}>
                        <label>
                          <input
                            type="checkbox"
                            name={key}
                            checked={on.has(key)}
                            disabled={saving}
                            onChange={(e) => setKeys([key], e.target.checked)}
                          />
                          {leafName(key)}
                        </label>
                        {on.has(key) && !original.has(key) && <span className="badge success">{perms.source.granted}</span>}
                        {!on.has(key) && original.has(key) && <span className="badge danger">{perms.source.revoked}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className={styles.actions}>
          <button type="button" className="primary" onClick={onSave} disabled={saving || !changed}>{text.save}</button>
          <button type="button" onClick={onReset} disabled={saving || !current.custom}>{text.reset}</button>
        </div>
      </div>

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
