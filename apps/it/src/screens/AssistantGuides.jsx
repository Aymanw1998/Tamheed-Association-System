import { useEffect, useState } from "react";
import { errorText, getAssistantGuides } from "../api";

// Students whose «المرشد المسؤول» is an assistant (owner, 2026-11-19). From
// now on only a guide or a manager can be chosen; these were set before and
// stay until a manager changes them in the student's page. Read-only here.
export default function AssistantGuides() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getAssistantGuides().then((res) => {
      if (!alive) return;
      if (res.ok) { setItems(res.data.items || []); setError(""); } else setError(errorText(res));
    });
    return () => { alive = false; };
  }, []);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!items) return <p role="status">…</p>;

  return (
    <section>
      <h1>طلاب مع مساعد مسؤول</h1>
      <p className="muted">«المرشد المسؤول» عن هؤلاء الطلاب مساعد. من الآن يُختار مرشد أو أحد الإدارة فقط؛ يغيّره المدير من صفحة الطالب في النظام.</p>
      {items.length === 0 ? <p>لا يوجد طلاب كهؤلاء.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الطالب</th><th>المساعد المسؤول</th></tr></thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.studentId}><td>{row.student}</td><td>{row.assistant}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
