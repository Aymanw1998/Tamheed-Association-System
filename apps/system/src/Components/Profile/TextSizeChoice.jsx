import React, { useState } from "react";
import sectionStyles from "../UI/FormSection.module.css";
import { TEXT_SIZES, getTextSize, setTextSize } from "../../utils/textSize";

// «حجم الخط» on the profile page (owner, 2026-11-17): applies at once and is
// kept on this device only.
export default function TextSizeChoice() {
  const [size, setSize] = useState(getTextSize);
  return (
    <fieldset className={sectionStyles.formSection} data-testid="text-size">
      <legend>حجم الخط</legend>
      <div role="radiogroup" aria-label="حجم الخط" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {TEXT_SIZES.map((s) => (
          <label key={s.id} style={{ marginTop: 0 }}>
            <input type="radio" name="text-size" value={s.id} checked={size === s.id}
              onChange={() => setSize(setTextSize(s.id))} />
            {" "}{s.label}
          </label>
        ))}
      </div>
      <small style={{ color: "var(--color-text-secondary)" }}>يُحفظ على هذا الجهاز فقط.</small>
    </fieldset>
  );
}
