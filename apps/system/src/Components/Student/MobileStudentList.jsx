import React from "react";
import StatusBadge from "../UI/StatusBadge.jsx";
import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
import { passportSrc } from "../../utils/passportPhoto";
import { healthNote, personInitial, studentSummary } from "../../utils/personCard";

// Phone layout for the students list: one compact card per student. Tapping the
// card opens the student's page, where print, edit and delete are, and
// approve/reject for a waiting request.
export default function MobileStudentList({
  students,
  statusOf,
  toneOf,
  onOpen,
}) {
  return (
    <PersonCardList emptyText="لا يوجد طلاب في هذه القائمة">
      {students.map((student) => {
        const status = statusOf(student);
        return (
          <PersonCard
            key={student._id || student.tz}
            initial={personInitial(student)}
            photo={passportSrc(student.photo) || ""}
            name={`${student.firstname || ""} ${student.lastname || ""}`.trim()}
            summary={studentSummary(student)}
            note={healthNote(student)}
            badge={status !== "active" && <StatusBadge tone={toneOf(student)}>{student.status}</StatusBadge>}
            onOpen={() => onOpen(student)}
            tour={status === "active" ? "students-open" : undefined}
          />
        );
      })}
    </PersonCardList>
  );
}
