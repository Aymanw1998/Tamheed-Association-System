import React, { useCallback, useState } from "react";
import "../Provides/ConfirmContext.css";
import { useI18n } from "../../i18n/I18nContext";
import { getStoredRole, isStoredSystem } from "../../utils/session";
import { assignableRoles, ROLE_LABEL_KEY } from "../../utils/roles";
import { fillText } from "../../utils/vehicleDisplay";

// Roles the signed-in user may give: strictly below his own role, every role
// for the system account. Hides UI only; the server decides.
export const viewerAssignableRoles = () =>
  assignableRoles({ role: getStoredRole(), isSystem: isStoredSystem() });

// Asks which role a user gets on approval (see viewerAssignableRoles).
function RolePickerDialog({ user, onClose }) {
  const { t } = useI18n();
  const options = viewerAssignableRoles();
  const [role, setRole] = useState(options[options.length - 1] || "");
  const name = `${user?.firstname || ""} ${user?.lastname || ""}`.trim() || String(user?.tz || "");

  return (
    <div className="c-overlay" role="dialog" aria-modal="true" aria-labelledby="role-picker-title">
      <div className="c-dialog">
        <div className="c-header"><h3 id="role-picker-title">{t("perms.approveTitle")}</h3></div>
        <div className="c-body">
          {options.length === 0 ? (
            <p>{t("perms.noAssignable")}</p>
          ) : (
            <label style={{ display: "grid", gap: 6 }}>
              {fillText(t("perms.approveMessage"), { name })}
              <select data-tour="role-picker-select" value={role} onChange={(e) => setRole(e.target.value)} autoFocus>
                {options.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r], r)}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="c-actions">
          <button type="button" className="c-btn" data-tour="role-picker-cancel" onClick={() => onClose(null)}>{t("perms.cancel")}</button>
          {options.length > 0 && (
            <button type="button" className="c-btn c-btn-primary" data-tour="role-picker-approve" disabled={!role} onClick={() => onClose(role)}>
              {t("perms.approve")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// const { pickRole, roleDialog } = useRolePicker();
// const role = await pickRole(user); // null when cancelled
export function useRolePicker() {
  const [request, setRequest] = useState(null);
  const pickRole = useCallback((user) => new Promise((resolve) => setRequest({ user, resolve })), []);
  const roleDialog = request ? (
    <RolePickerDialog
      user={request.user}
      onClose={(role) => { request.resolve(role || null); setRequest(null); }}
    />
  ) : null;
  return { pickRole, roleDialog };
}

// Server error codes shown to the user.
export const permissionError = (t, res) =>
  (res?.code && t(`perms.errors.${res.code}`, "")) || res?.message || t("perms.errors.generic");
