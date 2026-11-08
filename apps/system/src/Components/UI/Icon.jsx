import React from "react";

// One small outline icon set for the whole app (2026-11-08): 24×24, stroke
// icons that take the text color. Decorative by default (aria-hidden); pass
// a label to make an icon meaningful on its own.
const PATHS = {
  check: "M5 12l5 5L20 7",
  info: "M12 8h.01M11 12h1v4h1M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z",
  warning: "M12 9v4M12 17h.01M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  error: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM15 9l-6 6M9 9l6 6",
  x: "M18 6L6 18M6 6l12 12",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  search: "M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM21 21l-6-6",
  home: "M5 12H3l9-9l9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7M9 21v-6h6v6",
  calendar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM16 3v4M8 3v4M4 11h16",
  check_list: "M9 6h11M9 12h11M9 18h11M4 6l1 1l2-2M4 12l1 1l2-2M4 18l1 1l2-2",
  report: "M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 13h6M9 17h6",
  bell: "M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1",
  users: "M9 7a4 4 0 1 0 0 .01M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85",
  student: "M22 9L12 5L2 9l10 4l10-4v6M6 10.6V16a6 3 0 0 0 12 0v-5.4",
  folder: "M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  menu: "M4 6h16M4 12h16M4 18h16",
  plus: "M12 5v14M5 12h14",
  save: "M6 4h10l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M12 14a2 2 0 1 0 0 .01M14 4v4H8V4",
  inbox: "M4 13h3l3 3h4l3-3h3M4 13l2-8h12l2 8v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
  arrow_left: "M5 12h14M5 12l6 6M5 12l6-6",
  car: "M5 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2M9 17h6M6 6l-.5 5H19",
  ball: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7l4.8 3.5l-1.8 5.6H9l-1.8-5.6z",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9z",
  device: "M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM7 20h10M9 16v4M15 16v4",
};

export const ICON_NAMES = Object.keys(PATHS);

export default function Icon({ name, size = 20, label, className = "", strokeWidth = 1.8, style }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: "none", ...style }}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
