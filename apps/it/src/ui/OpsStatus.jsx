import { useEffect, useState } from "react";
import { getOpsStatus } from "../api";
import { Link } from "../router.jsx";

// The server's own checks (owner, 2026-11-16): the nightly backup, its copy on
// Google Drive, the weekly restore test and the free disk space.
// banner: shown on every screen, only when something needs attention.
// Otherwise (Settings): every check with its last result.
const STATE_TEXT = {
  ok: "سليم",
  failed: "فشل",
  stale: "لم يعمل في الوقت المتوقع",
  missing: "لم يعمل بعد",
};
const REFRESH_MS = 10 * 60 * 1000;

const when = (at) => (at ? new Date(at).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "");

export default function OpsStatus({ banner = false }) {
  const [checks, setChecks] = useState(null);

  useEffect(() => {
    let live = true;
    const load = () => getOpsStatus().then((res) => { if (live && res.ok) setChecks(res.data.checks || []); });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, []);

  if (!checks) return null;
  const problems = checks.filter((check) => !check.ok);

  if (banner) {
    if (!problems.length) return null;
    return (
      <div className="card ops-banner" role="alert">
        <strong>تنبيه من الخادم:</strong>
        <ul>
          {problems.map((check) => (
            <li key={check.id}>{check.label}: {STATE_TEXT[check.state]}{check.message ? ` (${check.message})` : ""}</li>
          ))}
        </ul>
        <Link to="/settings">التفاصيل في الإعدادات</Link>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>حالة الخادم</h2>
      <ul className="ops-list">
        {checks.map((check) => (
          <li key={check.id}>
            <span className={`badge ${check.ok ? "" : "danger"}`}>{STATE_TEXT[check.state]}</span>{" "}
            <strong>{check.label}</strong>
            {check.at && <span> · {when(check.at)}</span>}
            {check.message && <div className="muted">{check.message}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
