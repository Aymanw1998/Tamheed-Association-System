import React, { useEffect, useId, useRef } from "react";
import styles from "./StudentStatusFilter.module.css";

export default function StudentStatusFilter({
  value,
  defaultValue = "active",
  onChange,
  counts,
  disabled = false,
  compact = false,
  className = "",
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue);
  const current = isControlled ? value : internal;

  useEffect(() => {
    if (!isControlled) setInternal(defaultValue);
  }, [defaultValue, isControlled]);

  const id = useId();
  const rootRef = useRef(null);

  const buttons = [
    { key: "active", label: "مُفعاليّن", badge: counts?.active, color: "#8feba6ff" },
    { key: "waiting", label: "مُنتظرين", badge: counts?.pending, color: "#e9f85eff" },
  ];

  const select = (next) => {
    if (disabled) return;
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;

    const handler = (e) => {
      if (disabled) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const idx = buttons.findIndex((button) => button.key === current);
        if (idx === -1) return;
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const next = buttons[(idx + dir + buttons.length) % buttons.length].key;
        select(next);
      } else if (e.key === "Home") {
        e.preventDefault();
        select(buttons[0].key);
      } else if (e.key === "End") {
        e.preventDefault();
        select(buttons[buttons.length - 1].key);
      }
    };

    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [buttons, current, disabled]);

  return (
    <div className={`${styles.wrapper} ${compact ? styles.compact : ""} ${disabled ? styles.disabled : ""} ${className}`}>
      <div
        ref={rootRef}
        role="tablist"
        aria-label="فلترة الطلاب حسب الحالة"
        className={styles.group}
      >
        {buttons.map(({ key, label, badge, color }) => {
          const selected = current === key;

          return (
            <button
              key={key}
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-${key}`}
              onClick={() => select(key)}
              className={`${styles.btn} ${selected ? styles.btnSelected : ""}`}
              style={selected ? { backgroundColor: color } : {}}
              type="button"
              disabled={disabled}
            >
              <span className={styles.label}>{label}</span>
              {typeof badge === "number" && <span className={styles.badge}>{badge}</span>}
            </button>
          );
        })}
      </div>

      <div className={styles.srOnly} id={`${id}-active`} role="tabpanel" aria-labelledby="active" />
      <div className={styles.srOnly} id={`${id}-waiting`} role="tabpanel" aria-labelledby="waiting" />
      <div className={styles.srOnly} id={`${id}-noActive`} role="tabpanel" aria-labelledby="noActive" />
    </div>
  );
}
