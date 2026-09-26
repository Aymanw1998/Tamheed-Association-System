import React from "react";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
import { healthNote, personInitial, studentSummary } from "../../utils/personCard";

// Phone layout for the students list: one compact card per student. Tapping the
// card opens the student; approve/reject and the PDF file stay as buttons.
export default function MobileStudentList({
  students,
  statusOf,
  toneOf,
  onOpen,
  onPdf,
  onApprove,
  onReject,
}) {
  return (
    <PersonCardList emptyText="لا يوجد طلاب في هذا القسم">
      {students.map((student) => {
        const status = statusOf(student);
        return (
          <PersonCard
            key={student._id || student.tz}
            initial={personInitial(student)}
            name={`${student.firstname || ""} ${student.lastname || ""}`.trim()}
            summary={studentSummary(student)}
            note={healthNote(student)}
            badge={status !== "active" && <StatusBadge tone={toneOf(student)}>{student.status}</StatusBadge>}
            onOpen={status === "waiting" ? undefined : () => onOpen(student)}
            actions={
              status === "active" ? (
                <Button size="sm" variant="secondary" onClick={() => onPdf(student)}>
                  ملف الطالب
                </Button>
              ) : status === "waiting" ? (
                <>
                  <Button size="sm" variant="success" onClick={() => onApprove(student)}>
                    قبول
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => onReject(student)}>
                    رفض
                  </Button>
                </>
              ) : null
            }
          />
        );
      })}
    </PersonCardList>
  );
}
