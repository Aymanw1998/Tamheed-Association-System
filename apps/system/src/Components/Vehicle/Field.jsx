import React from "react";
import styles from "./Vehicle.module.css";

// A labelled form control. The label is tied to the control (htmlFor/id) and the
// error text is announced with it (aria-describedby / aria-invalid).
export default function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  options,
  error,
  hint,
  required = false,
  disabled = false,
  wide = false,
  rows = 3,
  ...rest
}) {
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    value: value ?? "",
    disabled,
    required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    ...rest,
  };

  let control;
  if (type === "select") {
    control = (
      <select {...common} onChange={(event) => onChange(event.target.value)}>
        {(options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (type === "textarea") {
    control = <textarea {...common} rows={rows} onChange={(event) => onChange(event.target.value)} />;
  } else {
    control = <input {...common} type={type} onChange={(event) => onChange(event.target.value)} />;
  }

  return (
    <div className={`${styles.field} ${wide ? styles.wide : ""}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className={styles.required} aria-hidden="true"> *</span>}
      </label>
      {control}
      {hint && (
        <span id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={styles.fieldError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
