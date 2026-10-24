import { useEffect, useState } from "react";
import { getMe, logout } from "./api.js";
import LoginPage from "./LoginPage.jsx";
import HomePage from "./HomePage.jsx";
import LessonsPage from "./LessonsPage.jsx";
import StadiumHeader from "./StadiumHeader.jsx";
import BottomTabs from "./BottomTabs.jsx";
import { Ball } from "./Art.jsx";
import FirstVisitGuide from "./guide/FirstVisitGuide.jsx";
import { hasSeenGuide, markGuideSeen } from "./guide/guideSteps.js";

export default function App() {
  const [state, setState] = useState("loading"); // loading | out | in | error
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("home");
  const [guideOpen, setGuideOpen] = useState(false);

  const closeGuide = () => {
    markGuideSeen();
    setGuideOpen(false);
  };

  const load = async () => {
    try {
      const r = await getMe();
      if (r.status === 401) return setState("out");
      if (!r.ok) return setState("error");
      setMe(r.data);
      setState("in");
      if (!hasSeenGuide()) setGuideOpen(true);
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
    setGuideOpen(false);
    setState("out");
  };

  if (state === "loading") {
    return (
      <div className="center-note">
        <Ball className="loading-ball" />
        <p>جارٍ التحميل…</p>
      </div>
    );
  }
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
      <StadiumHeader firstname={me.student.firstname} sportName={me.card.sport.name} onLogout={onLogout} onHelp={() => setGuideOpen(true)} />
      <main className="content">
        {tab === "home" ? <HomePage me={me} /> : <LessonsPage me={me} />}
      </main>
      <BottomTabs tab={tab} onChange={setTab} />
      {guideOpen && <FirstVisitGuide firstname={me.student.firstname} gender={me.student.gender} onClose={closeGuide} />}
    </div>
  );
}
