import React from "react";
import styles from "./DisplayScreensPage.module.css";

// The wall layouts as picture cards (owner, 2026-11-12): the names alone say
// little, so each card shows a small drawing of the screen and one line on
// what it is for. Used for a new screen (nothing picked in advance) and to
// change an existing screen's layout.
export const LAYOUTS = [
  { value: "week", label: "كل الأسبوع", text: "كل أيام الأسبوع جنبًا إلى جنب. مناسب لعرض الأسبوع كله بنظرة واحدة." },
  { value: "today", label: "اليوم بالتفصيل", text: "برامج اليوم بخط كبير حسب الساعة، وعلى الجانب ملخص الأيام القادمة." },
  { value: "rotate", label: "يومًا بعد يوم", text: "يوم واحد في كل مرة ببطاقات كبيرة، ينتقل لليوم التالي كل 15 ثانية." },
  { value: "rooms", label: "اليوم حسب الغرف", text: "الغرف أعمدة في الأعلى والساعات على الجانب، واللوح ينزل مع الساعة." },
];

export const layoutLabel = (value) => (LAYOUTS.find((l) => l.value === value) || { label: value }).label;

const C = { bg: "#f4f6fa", card: "#ffffff", line: "#dde3ec", ink: "#b8c3d6", blue: "#2f6fe4", blueBg: "#e3edff", green: "#22a06b", greenBg: "#dcf7e9", red: "#e5484d" };

function Frame({ children }) {
  return (
    <svg viewBox="0 0 160 90" className={styles.thumb} aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="159" height="89" rx="5" fill={C.bg} stroke={C.line} />
      <rect x="0.5" y="0.5" width="159" height="11" rx="5" fill={C.card} />
      <rect x="0.5" y="11" width="159" height="1" fill={C.blue} />
      <rect x="118" y="3.5" width="34" height="4" rx="2" fill={C.ink} />
      <rect x="8" y="3" width="16" height="5" rx="2" fill={C.blue} />
      {children}
    </svg>
  );
}

const block = (x, y, w, h, kind) => {
  const fill = kind === "now" ? C.greenBg : kind === "next" ? C.blueBg : C.card;
  const edge = kind === "now" ? C.green : kind === "next" ? C.blue : C.ink;
  return (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={w} height={h} rx="1.5" fill={fill} stroke={C.line} strokeWidth="0.6" />
      <rect x={x + w - 1.6} y={y} width="1.6" height={h} fill={edge} />
    </g>
  );
};

const THUMBS = {
  week: () => (
    <Frame>
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 128 - i * 30;
        return (
          <g key={i}>
            <rect x={x} y="16" width="26" height="70" rx="2" fill={i === 1 ? C.blueBg : "#eef1f6"} stroke={i === 1 ? C.blue : "none"} strokeWidth="0.8" />
            {block(x + 2, 22, 22, 11, i === 1 ? "now" : "")}
            {block(x + 2, 36, 22, 11, i === 1 ? "next" : "")}
            {i % 2 === 0 ? block(x + 2, 50, 22, 11, "") : null}
          </g>
        );
      })}
    </Frame>
  ),
  today: () => (
    <Frame>
      {block(48, 17, 106, 14, "")}
      {block(48, 34, 106, 14, "now")}
      {block(48, 51, 106, 14, "next")}
      {block(48, 68, 106, 14, "")}
      <rect x="6" y="17" width="38" height="65" rx="2" fill={C.card} stroke={C.line} strokeWidth="0.6" />
      {[25, 38, 51, 64].map((y) => <rect key={y} x="10" y={y} width="30" height="3" rx="1.5" fill={C.ink} />)}
    </Frame>
  ),
  rotate: () => (
    <Frame>
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={50 + i * 13} y="16" width="10" height="4" rx="2" fill={i === 1 ? C.blue : C.ink} />)}
      {block(108, 26, 46, 26, "now")}
      {block(57, 26, 46, 26, "next")}
      {block(6, 26, 46, 26, "")}
      {block(108, 56, 46, 22, "")}
      <rect x="6" y="84" width="148" height="2" rx="1" fill={C.line} />
      <rect x="64" y="84" width="90" height="2" rx="1" fill={C.blue} />
    </Frame>
  ),
  rooms: () => (
    <Frame>
      {[0, 1, 2, 3].map((i) => <rect key={i} x={110 - i * 34} y="15" width="31" height="6" rx="1.5" fill={C.card} stroke={C.line} strokeWidth="0.6" />)}
      {[30, 45, 60, 75].map((y) => <rect key={y} x="6" y={y} width="148" height="0.6" fill={C.line} />)}
      {[30, 45, 60, 75].map((y) => <rect key={`l${y}`} x="145" y={y - 1.5} width="10" height="3" rx="1.5" fill={C.ink} />)}
      {block(110, 24, 31, 20, "past")}
      {block(110, 47, 31, 18, "next")}
      {block(76, 33, 31, 24, "now")}
      {block(42, 27, 31, 14, "")}
      {block(42, 52, 31, 26, "next")}
      {block(8, 40, 31, 30, "")}
      <rect x="6" y="44" width="148" height="1.2" fill={C.red} />
      <circle cx="145" cy="44.6" r="2.2" fill={C.red} />
    </Frame>
  ),
};

// A radio group of picture cards. value "" means nothing picked yet.
export default function LayoutCards({ value, onPick, disabled, label }) {
  return (
    <div className={styles.cards} role="radiogroup" aria-label={label}>
      {LAYOUTS.map((l) => {
        const Thumb = THUMBS[l.value];
        const on = value === l.value;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on ? "true" : "false"}
            className={styles.card}
            data-layout={l.value}
            disabled={disabled}
            onClick={() => onPick(l.value)}
          >
            <Thumb />
            <b className={styles.cardName}>{l.label}</b>
            <span className={styles.cardText}>{l.text}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LayoutThumb({ value }) {
  const Thumb = THUMBS[value];
  return Thumb ? <Thumb /> : null;
}
