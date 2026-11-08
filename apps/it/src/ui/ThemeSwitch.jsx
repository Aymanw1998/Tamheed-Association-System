import React, { useEffect, useState } from "react";
import { getThemePreference, onThemeChange, setThemePreference } from "../theme";
import styles from "./ThemeSwitch.module.css";

const OPTIONS = [
  { value: "auto", label: "تلقائي", hint: "حسب إعداد الجهاز" },
  { value: "light", label: "فاتح" },
  { value: "dark", label: "داكن" },
];

// The theme choice, the same as in the everyday app (2026-11-08).
export default function ThemeSwitch() {
  const [choice, setChoice] = useState(getThemePreference);
  useEffect(() => onThemeChange((_theme, preference) => setChoice(preference)), []);
  return (
    <div className={styles.wrap} role="radiogroup" aria-label="المظهر">
      <span className={styles.title}>المظهر</span>
      <div className={styles.options}>
        {OPTIONS.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={choice === option.value}
            title={option.hint || option.label}
            className={`${styles.option} ${choice === option.value ? styles.on : ""}`}
            onClick={(event) => { event.stopPropagation(); setChoice(option.value); setThemePreference(option.value); }}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
