import { HomeIcon, CalendarIcon } from "./Art.jsx";

const TABS = [
  { id: "home", label: "الرئيسية", Icon: HomeIcon },
  { id: "lessons", label: "دروسي", Icon: CalendarIcon },
];

export default function BottomTabs({ tab, onChange }) {
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
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
