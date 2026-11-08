import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import { getThemePreference, onThemeChange, setThemePreference } from "../../utils/theme";
import styles from "./ThemeSwitch.module.css";

const OPTIONS = [
  { value: "auto", label: "تلقائي", icon: "device", hint: "حسب إعداد الجهاز" },
  { value: "light", label: "فاتح", icon: "sun" },
  { value: "dark", label: "داكن", icon: "moon" },
];

// The theme choice (package C, 2026-11-08): automatic, light or dark.
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
            <Icon name={option.icon} size={16} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
