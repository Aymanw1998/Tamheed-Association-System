import React from "react";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
import { personInitial, userSummary } from "../../utils/personCard";
import { useI18n } from "../../i18n/I18nContext";

const ROOM_BADGE = {
  waiting: { tone: "warning", label: "بانتظار الموافقة" },
  noActive: { tone: "neutral", label: "موقوف" },
};

// Phone layout for the users list, matching the students cards. Active users
// open on tap; waiting and disabled users keep their activate/delete buttons.
// canManage(user) hides the actions the viewer may not take on that user.
export default function MobileUserList({ users, onOpen, onPdf, onActivate, onDelete, onUnlock, canManage = () => true }) {
  const { t } = useI18n();
  return (
    <PersonCardList emptyText="لا توجد بيانات لعرضها">
      {users.map((user) => {
        const badge = ROOM_BADGE[user.room];
        const locked = !badge && Boolean(user.lockedAt);
        const manageable = canManage(user);
        return (
          <PersonCard
            key={user._id}
            initial={personInitial(user)}
            name={`${user.firstname || ""} ${user.lastname || ""}`.trim()}
            summary={userSummary(user)}
            badge={badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : locked && <StatusBadge tone="danger">{t("perms.locked")}</StatusBadge>}
            onOpen={badge ? undefined : () => onOpen(user)}
            tour={!badge && manageable ? "users-edit" : undefined}
            actions={
              badge ? (manageable && (
                <>
                  <Button size="sm" variant="success" data-tour={user.room === "waiting" ? "users-approve" : undefined} onClick={() => onActivate(user)}>
                    {user.room === "waiting" ? "قبول" : "تفعيل"}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => onDelete(user)}>
                    حذف
                  </Button>
                </>
              )) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => onPdf(user)}>
                    ملف المستخدم
                  </Button>
                  {locked && onUnlock && manageable && (
                    <Button size="sm" variant="secondary" onClick={() => onUnlock(user)}>
                      {t("perms.unlock")}
                    </Button>
                  )}
                </>
              )
            }
          />
        );
      })}
    </PersonCardList>
  );
}
