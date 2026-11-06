import React, { useEffect, useState } from "react";
import "../Provides/ConfirmContext.css";
import { getAll as getUsers } from "../../WebServer/services/user/functionsUser.jsx";
import { responsibleGuideOptions } from "../../utils/studentForm";
import RequiredMark from "../UI/RequiredMark";

// Approving a request names the student's responsible guide, who may also be
// from the management (owner, 2026-11-05).
export default function GuidePickerDialog({ student, onPick, onClose }) {
  const [options, setOptions] = useState(null);
  const [guide, setGuide] = useState("");
  const name = `${student?.firstname || ""} ${student?.lastname || ""}`.trim() || String(student?.tz || "");

  useEffect(() => {
    let alive = true;
    getUsers()
      .then((res) => { if (alive) setOptions(responsibleGuideOptions(res?.ok ? res.users : [], "")); })
      .catch(() => { if (alive) setOptions([]); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="c-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-picker-title">
      <div className="c-dialog">
        <div className="c-header"><h3 id="guide-picker-title">قبول الطالب</h3></div>
        <div className="c-body">
          <label style={{ display: "grid", gap: 6 }}>
            <span>اختر المرشد المسؤول عن {name}<RequiredMark /></span>
            <select data-testid="guide-picker" value={guide} onChange={(event) => setGuide(event.target.value)} disabled={!options}>
              <option value="">{options ? "اختر المرشد المسؤول" : "جارٍ التحميل…"}</option>
              {(options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="c-actions">
          <button type="button" className="c-btn" onClick={onClose}>إلغاء</button>
          <button type="button" className="c-btn c-btn-primary" disabled={!guide} onClick={() => onPick(guide)}>قبول</button>
        </div>
      </div>
    </div>
  );
}
