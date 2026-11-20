import React, { useState } from "react";
import { Link } from "react-router-dom";
import { getArchived } from "../../WebServer/services/student/functionsStudent.jsx";

const dateOf = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB") : "";
};

// «طلاب سابقون» (owner, 2026-11-19): students who became staff. Their record
// stays, read-only, with all their attendance; it is read only when opened.
export default function FormerStudents() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");

  const onToggle = async (event) => {
    if (!event.currentTarget.open || list) return;
    setError(""); // a reopen after an error tries again with a clean message (testing review)
    const res = await getArchived();
    if (res.ok) setList(res.students); else setError(res.message);
  };

  return (
    <details onToggle={onToggle} style={{ marginTop: 24 }}>
      <summary>طلاب سابقون (أصبحوا من الطاقم)</summary>
      {error && <p role="alert">{error}</p>}
      {!error && !list && <p role="status">جارٍ التحميل…</p>}
      {list && list.length === 0 && <p>لا يوجد طلاب سابقون.</p>}
      {list && list.length > 0 && (
        <ul>
          {list.map((s) => (
            <li key={s._id}>
              <Link to={`/students/${s.tz}`}>{`${s.firstname} ${s.lastname}`.trim() || s.tz}</Link>
              {" · "}أصبح من الطاقم في {dateOf(s.staffConversion?.doneAt || s.archivedAt)}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
