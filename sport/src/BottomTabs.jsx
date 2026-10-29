import { HomeIcon, BellIcon } from "./Art.jsx";

const TABS = [
  { id: "home", label: "الرئيسية", Icon: HomeIcon },
  { id: "notices", label: "الإعلانات", Icon: BellIcon },
];

// `badges` holds a count per tab id (new notices); 0 shows nothing.
export default function BottomTabs({ tab, onChange, badges = {} }) {
  return (
    <nav className="tabs">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={tab === id ? "on" : ""}
          aria-current={tab === id ? "page" : undefined}
          onClick={() => onChange(id)}
        >
          <Icon />
          <span>
            {label}
            {badges[id] > 0 && <em className="tab-badge" aria-label={`${badges[id]} جديد`}>{badges[id]}</em>}
          </span>
        </button>
      ))}
    </nav>
  );
}
