import React, { forwardRef } from "react";
import styles from "./Button.module.css";
import Icon from "./Icon";

const VARIANT_CLASS = {
  primary: styles.primary,
  secondary: styles.secondary,
  success: styles.success,
  danger: styles.danger,
  warning: styles.warning,
  ghost: styles.ghost,
};

const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    // success: a short confirmation in the button itself (useSavedFlash).
    success = false,
    successLabel = "تم الحفظ",
    disabled = false,
    type = "button",
    className = "",
    children,
    ...rest
  },
  ref
) {
  const variantClass = VARIANT_CLASS[variant] || VARIANT_CLASS.primary;
  const sizeClass = size === "sm" ? styles.sm : "";

  return (
    <button
      ref={ref}
      type={type}
      className={`${styles.button} ${variantClass} ${sizeClass} ${success && !loading ? styles.done : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-ui="button"
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {success && !loading && <span className={styles.check}><Icon name="check" size={16} strokeWidth={2.6} /></span>}
      <span className={styles.label} aria-live={success ? "polite" : undefined}>{success && !loading ? successLabel : children}</span>
    </button>
  );
});

export default Button;
