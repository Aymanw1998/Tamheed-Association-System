import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getStoredPermissions } from "../../utils/session";
import { getUnsavedChanges } from "../../utils/unsavedChanges";
import { fillText } from "../../utils/vehicleDisplay";
import { useI18n } from "../../i18n/I18nContext";
import { usePermissionsVersion } from "./useOwnAccessLive";

// When the signed-in user's access changes (an admin's edit, owner
// 2026-11-02), the page names what was taken away or added and redraws, so
// what was taken away disappears. A page holding unsaved edits is not
// redrawn under the user: it waits until they leave it (after saving or not)
// or press «حدّث الآن». `applied` keys the page; the menu may follow the
// live version at once.
//   const { applied, notice } = useAccessUpdates();
export default function useAccessUpdates() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const version = usePermissionsVersion();
  const [applied, setApplied] = useState(version);
  const [change, setChange] = useState(null);
  const seen = useRef(getStoredPermissions());

  useEffect(() => {
    const now = getStoredPermissions();
    const before = new Set(seen.current);
    const after = new Set(now);
    seen.current = now;
    const removed = [...before].filter((k) => !after.has(k));
    const added = now.filter((k) => !before.has(k));
    if (removed.length || added.length) setChange({ removed, added });
    if (getUnsavedChanges() !== true) setApplied(version);
  }, [version]);

  // Leaving the page applies a waiting change.
  const latest = useRef(version);
  latest.current = version;
  useEffect(() => { setApplied(latest.current); }, [pathname]);

  const waiting = applied !== version;
  const label = (key) => {
    const [module, leaf] = key.split(".");
    return `${t(`perms.modules.${module}`, module)}: ${t(`perms.leavesByModule.${module}.${leaf}`, t(`perms.leaves.${leaf}`, leaf))}`;
  };
  const notice = change && (
    <div data-testid="access-notice" role="status" dir="rtl" style={{
      margin: "8px 16px", padding: "10px 14px", borderRadius: 10, border: "1px solid #f59e0b",
      background: "#fffbeb", color: "#78350f", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
    }}>
      <div style={{ flex: "1 1 240px" }}>
        {change.removed.length > 0 && <p style={{ margin: 0 }}>{fillText(t("perms.accessRemoved"), { list: change.removed.map(label).join("، ") })}</p>}
        {change.added.length > 0 && <p style={{ margin: 0 }}>{fillText(t("perms.accessAdded"), { list: change.added.map(label).join("، ") })}</p>}
        {waiting && <p style={{ margin: 0 }}>{t("perms.accessWaiting")}</p>}
      </div>
      {waiting && <button type="button" onClick={() => setApplied(version)}>{t("perms.accessApplyNow")}</button>}
      <button type="button" onClick={() => setChange(null)}>{t("perms.accessClose")}</button>
    </div>
  );
  return { applied, notice };
}
