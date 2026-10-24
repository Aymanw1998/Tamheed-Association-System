import { useEffect, useState } from "react";
import { getMe, logout } from "./api.js";
import LoginPage from "./LoginPage.jsx";
import HomePage from "./HomePage.jsx";
import TeamsPage from "./TeamsPage.jsx";
import BottomTabs from "./BottomTabs.jsx";
import logo from "./logo.png";

export default function App() {
  const [state, setState] = useState("loading"); // loading | out | in | error
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("home");

  const load = async () => {
    try {
      const r = await getMe();
      if (r.status === 401) return setState("out");
      if (!r.ok) return setState("error");
      setMe(r.data);
      setState("in");
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      // On a network failure we still leave the screen.
    }
    setMe(null);
    setTab("home");
    setState("out");
  };

  if (state === "loading") return <div className="center-note">جارٍ التحميل…</div>;
  if (state === "out") return <LoginPage onSignedIn={load} />;
  if (state === "error") {
    return (
      <div className="center-note">
        <p>حدث خطأ، حاول مرة أخرى</p>
        <button className="btn" onClick={load}>إعادة المحاولة</button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <img src={logo} alt="" />
        <div className="topbar-title">
          <b>أهلاً {me.student.firstname} 👋</b>
          <span>تمهيد سبورت</span>
        </div>
        <button className="link-btn" onClick={onLogout}>خروج</button>
      </header>
      <main className="content">
        {tab === "home" ? <HomePage me={me} /> : <TeamsPage teams={me.teams} />}
      </main>
      <BottomTabs tab={tab} onChange={setTab} />
    </div>
  );
}
