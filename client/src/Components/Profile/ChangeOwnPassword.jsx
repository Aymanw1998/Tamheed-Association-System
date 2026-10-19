import React, { useState } from "react";
import styles from "./Profile.module.css";
import sectionStyles from "../UI/FormSection.module.css";
import EyeIcon from "../UI/EyeIcon";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { changePassword } from "../../WebServer/services/auth/fuctionsAuth";
import { newPasswordError } from "../../utils/passwordChange";
import { useI18n } from "../../i18n/I18nContext";

// One's own password (profile, or one's own page in Users). Goes only through
// POST /auth/change-password with the current password; the server then
// starts a new session and every older token stops working.
export default function ChangeOwnPassword() {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const errorText = (code) => t(`passwordChange.errors.${code}`, t("passwordChange.errors.generic"));

  const submit = async () => {
    setError("");
    const problem = newPasswordError({ currentPassword, newPassword, confirmPassword });
    if (problem) return setError(errorText(problem));
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("passwordChange.success"));
    } catch (err) {
      setError(errorText(err?.code || "generic"));
    } finally {
      setSaving(false);
    }
  };

  const field = (id, label, value, setValue, autoComplete) => (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete}
        value={value} onChange={(e) => setValue(e.target.value)} />
    </>
  );

  return (
    <fieldset className={sectionStyles.formSection}>
      <legend>{t("passwordChange.ownTitle")}</legend>
      <label htmlFor="own-current-password">{t("passwordChange.current")}</label>
      <div className={styles.passwordWrapper}>
        <input id="own-current-password" type={show ? "text" : "password"} autoComplete="current-password"
          value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <button type="button" className={styles.togglePassword} onClick={() => setShow((v) => !v)}
          aria-label={show ? t("passwordChange.hide") : t("passwordChange.show")} aria-pressed={show}>
          <EyeIcon open={show} />
        </button>
      </div>
      {field("own-new-password", t("passwordChange.newPassword"), newPassword, setNewPassword, "new-password")}
      {field("own-confirm-password", t("passwordChange.confirm"), confirmPassword, setConfirmPassword, "new-password")}
      <small>{t("passwordChange.hint")}</small>
      {error && <label role="alert" style={{ color: "var(--color-danger-700)" }}>{error}</label>}
      <button type="button" onClick={submit} disabled={saving}>
        {saving ? "..." : t("passwordChange.submit")}
      </button>
    </fieldset>
  );
}
