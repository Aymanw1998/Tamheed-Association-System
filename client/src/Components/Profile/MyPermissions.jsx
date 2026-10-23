import React from "react";
import { useI18n } from "../../i18n/I18nContext";
import { leavesOf, visibleModules } from "../../utils/permissionTree";
import sectionStyles from "../UI/FormSection.module.css";
import tabStyles from "../User/PermissionsTab.module.css";

// "صلاحياتي": the signed-in user's effective permissions, grouped by module.
// Read only; changes go through a permissions manager.
export default function MyPermissions({ permissions }) {
  const { t } = useI18n();
  const held = new Set(Array.isArray(permissions) ? permissions : []);
  const groups = visibleModules()
    .map((module) => ({ module, keys: leavesOf(module).filter((key) => held.has(key)) }))
    .filter((group) => group.keys.length > 0);

  return (
    <fieldset className={sectionStyles.formSection}>
      <legend>{t("perms.mine")}</legend>
      <small>{t("perms.mineHint")}</small>
      {groups.length === 0 ? (
        <p>{t("perms.mineEmpty")}</p>
      ) : (
        <ul className={tabStyles.myModules}>
          {groups.map(({ module, keys }) => (
            <li key={module}>
              <strong>{t(`perms.modules.${module}`, module)}</strong>
              {keys.map((key) => t(`perms.leavesByModule.${key}`, t(`perms.leaves.${key.split(".")[1]}`, key))).join("، ")}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
