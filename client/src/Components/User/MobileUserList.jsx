import React from "react";
import StatusBadge from "../UI/StatusBadge.jsx";
import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
import { personInitial, userSummary } from "../../utils/personCard";
import { useI18n } from "../../i18n/I18nContext";

const ROOM_BADGE = {
  waiting: { tone: "warning", label: "بانتظار الموافقة" },
  noActive: { tone: "neutral", label: "موقوف" },
};

// Phone layout for the users list, matching the students cards. Every card
// opens the user's page on tap: print, edit, unlock, suspend and delete are
// there, and approve/activate for a waiting or suspended account.
export default function MobileUserList({ users, onOpen }) {
  const { t } = useI18n();
  return (
    <PersonCardList emptyText="لا توجد بيانات لعرضها">
      {users.map((user) => {
        const badge = ROOM_BADGE[user.room];
        const locked = !badge && Boolean(user.lockedAt);
        return (
          <PersonCard
            key={user._id}
            initial={personInitial(user)}
            name={`${user.firstname || ""} ${user.lastname || ""}`.trim()}
            summary={userSummary(user)}
            badge={badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : locked && <StatusBadge tone="danger">{t("perms.locked")}</StatusBadge>}
            onOpen={() => onOpen(user)}
            tour={!badge ? "users-edit" : undefined}
          />
        );
      })}
    </PersonCardList>
  );
}
