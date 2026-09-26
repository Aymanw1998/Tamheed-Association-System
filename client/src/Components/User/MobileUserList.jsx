import React from "react";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
import { personInitial, userSummary } from "../../utils/personCard";

const ROOM_BADGE = {
  waiting: { tone: "warning", label: "بانتظار الموافقة" },
  noActive: { tone: "neutral", label: "مُعطل" },
};

// Phone layout for the users list, matching the students cards. Active users
// open on tap; waiting and disabled users keep their activate/delete buttons.
export default function MobileUserList({ users, onOpen, onPdf, onActivate, onDelete }) {
  return (
    <PersonCardList emptyText="لا يوجد بيانات لإظهارها">
      {users.map((user) => {
        const badge = ROOM_BADGE[user.room];
        return (
          <PersonCard
            key={user._id}
            initial={personInitial(user)}
            name={`${user.firstname || ""} ${user.lastname || ""}`.trim()}
            summary={userSummary(user)}
            badge={badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
            onOpen={badge ? undefined : () => onOpen(user)}
            actions={
              badge ? (
                <>
                  <Button size="sm" variant="success" onClick={() => onActivate(user)}>
                    {user.room === "waiting" ? "موافقة" : "تفعيل"}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => onDelete(user)}>
                    حذف
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => onPdf(user)}>
                  ملف المستخدم
                </Button>
              )
            }
          />
        );
      })}
    </PersonCardList>
  );
}
