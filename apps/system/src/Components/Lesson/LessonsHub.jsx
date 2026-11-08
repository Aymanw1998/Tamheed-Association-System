import TabIndicator from "../UI/TabIndicator";
import React from "react";
import { useNavigate } from "react-router-dom";
import { canAccessPath } from "../../utils/routeAccess";
import { getStoredPermissions } from "../../utils/session";

const TABS = [
  { key: "lessons", path: "/lessons", label: "برنامج الأسبوع" },
  { key: "attendance", path: "/calendar", label: "الحضور والغياب" },
];

const bar = { display: "flex", gap: 8, margin: "12px 16px 0", flexWrap: "wrap" };
const tab = { minHeight: 44, padding: "0 20px", borderRadius: 10, border: "1px solid var(--color-border-strong)", background: "var(--color-surface)", color: "var(--color-primary-700)", font: "inherit", fontWeight: 700, cursor: "pointer" };
const on = { ...tab, background: "var(--color-primary-700)", borderColor: "var(--color-primary-700)", color: "#fff" };

// Attendance is a part of the lessons (owner, 2026-11-05). Each tab keeps its own
// address and its own permission; with only one of them there is nothing to choose.
export default function LessonsHub({ active, children }) {
  const navigate = useNavigate();
  const allowed = TABS.filter(({ path }) => canAccessPath(path, getStoredPermissions()));
  return (
    <>
      {allowed.length > 1 && (
        <div role="tablist" aria-label="البرامج والحضور" style={bar} dir="rtl">
          {allowed.map(({ key, path, label }) => (
            <button key={key} type="button" role="tab" aria-selected={key === active} data-tour={`lessons-hub-${key}`} style={key === active ? on : tab} onClick={() => navigate(path)}>
              {label}
            </button>
          ))}
          <TabIndicator variant="pill" />
        </div>
      )}
      {children}
    </>
  );
}
