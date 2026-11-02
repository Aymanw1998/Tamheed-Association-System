import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getStoredPermissions } from "../../utils/session";
import { getUnsavedChanges } from "../../utils/unsavedChanges";
import { useI18n } from "../../i18n/I18nContext";
import { usePermissionsVersion } from "./useOwnAccessLive";

// When the signed-in user's permissions change (an admin's edit), the page
// says so in one general message, without listing what changed (owner,
// 2026-11-03), and redraws, so what was taken away disappears. A page holding
// unsaved edits is not redrawn under the user: it waits until they leave it
// (after saving or not) or press «حدّث الآن». `applied` keys the page; the
// menu may follow the live version at once.
//   const { applied, notice } = useAccessUpdates();
export default function useAccessUpdates() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const version = usePermissionsVersion();
  const [applied, setApplied] = useState(version);
  const [changed, setChanged] = useState(false);
  const seen = useRef(getStoredPermissions());

  useEffect(() => {
    const now = getStoredPermissions();
    const before = seen.current;
    seen.current = now;
    if (now.length !== before.length || now.some((k) => !before.includes(k))) setChanged(true);
    if (getUnsavedChanges() !== true) setApplied(version);
  }, [version]);

  // Leaving the page applies a waiting change.
  const latest = useRef(version);
  latest.current = version;
  useEffect(() => { setApplied(latest.current); }, [pathname]);

  const waiting = applied !== version;
  const notice = changed && (
    <div data-testid="access-notice" role="status" dir="rtl" style={{
      margin: "8px 16px", padding: "10px 14px", borderRadius: 10, border: "1px solid #f59e0b",
      background: "#fffbeb", color: "#78350f", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
    }}>
      <div style={{ flex: "1 1 240px" }}>
        <p style={{ margin: 0 }}>{t("perms.accessChanged")}</p>
        {waiting && <p style={{ margin: 0 }}>{t("perms.accessWaiting")}</p>}
      </div>
      {waiting && <button type="button" onClick={() => setApplied(version)}>{t("perms.accessApplyNow")}</button>}
      <button type="button" onClick={() => setChanged(false)}>{t("perms.accessClose")}</button>
    </div>
  );
  return { applied, notice };
}
