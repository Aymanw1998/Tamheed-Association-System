import React, { useState } from "react";
import styles from "../LoginPage/LoginPage.module.css";
import EyeIcon from "../../UI/EyeIcon";
import { changePassword } from "../../../WebServer/services/auth/fuctionsAuth";
import { newPasswordError } from "../../../utils/passwordChange";
import { useI18n } from "../../../i18n/I18nContext";

// Shown instead of the login form when the login answered mustChangePassword
// (system account, password older than 30 days or temporary). Nothing else is
// reachable: the limited token only works on change-password. `currentPassword`
// is the password the user just signed in with.
export default function ForcedPasswordChange({ token, currentPassword, onChanged, onCancel }) {
  const { t } = useI18n();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const errorText = (code) => t(`passwordChange.errors.${code}`, t("passwordChange.errors.generic"));

  const submit = async (e) => {
    e?.preventDefault?.();
    setError("");
    const problem = newPasswordError({ currentPassword, newPassword, confirmPassword });
    if (problem) return setError(errorText(problem));
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword, token);
      await onChanged(newPassword);
    } catch (err) {
      setError(errorText(err?.code || "generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.loginForm} onSubmit={submit} noValidate>
      <h2>{t("passwordChange.title")}</h2>
      <p className={styles.formHint}>{t("passwordChange.intro")}</p>

      <label className={styles.fieldLabel} htmlFor="forced-new-password">{t("passwordChange.newPassword")}</label>
      <div className={styles.passwordWrapper}>
        <input
          id="forced-new-password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoFocus
          required
        />
        <button
          type="button"
          className={styles.togglePassword}
          onClick={() => setShow((value) => !value)}
          aria-label={show ? t("passwordChange.hide") : t("passwordChange.show")}
          aria-pressed={show}
        >
          <EyeIcon open={show} />
        </button>
      </div>

      <label className={styles.fieldLabel} htmlFor="forced-confirm-password">{t("passwordChange.confirm")}</label>
      <input
        id="forced-confirm-password"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      <p className={styles.formHint}>{t("passwordChange.hint")}</p>

      {error && <p className={styles.formError} role="alert">{error}</p>}

      <button type="submit" disabled={loading}>{loading ? "..." : t("passwordChange.submit")}</button>
      <hr />
      <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={loading}>
        {t("passwordChange.back")}
      </button>
    </form>
  );
}
