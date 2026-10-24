import { Ball, Floodlight, LogoBadge } from "./Art.jsx";

// «الملعب الليلي»: floodlights over a dark pitch, the pitch arc, the ball and the logo.
export default function StadiumHeader({ firstname, sportName, onLogout, onHelp }) {
  return (
    <header className="stadium">
      <div className="stadium-sky" aria-hidden="true">
        <span className="beam beam-r" />
        <span className="beam beam-l" />
        <Floodlight className="mast mast-r" />
        <Floodlight className="mast mast-l" />
        <span className="stands" />
        <span className="grass" />
        <svg className="pitch-lines" viewBox="0 0 400 80" preserveAspectRatio="none">
          <path d="M-10 6 L410 6" />
          <path d="M200 6 L200 80" />
          <path d="M92 80 A108 46 0 0 1 308 80" />
          <ellipse cx="200" cy="80" rx="3.5" ry="2" />
        </svg>
        <span className="ball-shadow" />
        <Ball className="hero-ball" />
      </div>
      <div className="stadium-top">
        <LogoBadge className="hero-logo" />
        <span className="top-actions">
          <button type="button" className="help-btn" onClick={onHelp} aria-label="جولة تعريفية" title="جولة تعريفية">؟</button>
          <button type="button" className="logout" onClick={onLogout}>خروج</button>
        </span>
      </div>
      <div className="stadium-hello">
        <h1>أهلاً {firstname} 👋</h1>
        <p>تمهيد - رياضة · {sportName}</p>
      </div>
    </header>
  );
}
