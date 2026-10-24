const TABS = [
  { id: "home", label: "الرئيسية", icon: "🏠" },
  { id: "teams", label: "فريقي", icon: "👥" },
];

export default function BottomTabs({ tab, onChange }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => onChange(t.id)}>
          <i>{t.icon}</i>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
