import { useEffect, useRef, useState } from "react";
import { getMe, logout } from "./api.js";
import LoginPage from "./LoginPage.jsx";
import HomePage from "./HomePage.jsx";
import LessonsPage from "./LessonsPage.jsx";
import StadiumHeader from "./StadiumHeader.jsx";
import BottomTabs from "./BottomTabs.jsx";
import { Ball } from "./Art.jsx";
import FirstVisitGuide from "./guide/FirstVisitGuide.jsx";
import AppChrome from "./pwa/AppChrome.jsx";
import { clearApiCache } from "./pwa/clearApiCache";
import { unsubscribeSport } from "./pwa/pushOptIn";
import { hasSeenGuide, markGuideSeen } from "./guide/guideSteps.js";
import { attachRefresh } from "./refreshOnReturn";
import { openLiveMe } from "./liveMe";

// Session ended: forget cached answers and stop pushes for this device (best effort, 3s cap).
async function endSession() {
  await Promise.race([unsubscribeSport(), new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {});
  await clearApiCache();
}

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
      if (r.status === 401) {
        setState("out");
        return endSession();
      }
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

  // While signed in, reload quietly when the app comes back to the screen, so
  // changes the staff made (stats, attendance, name, photo) show without signing in again.
  const stateRef = useRef(state);
  stateRef.current = state;
  const reloadQuietly = useRef(null);
  reloadQuietly.current = async () => {
    if (stateRef.current !== "in") return;
    try {
      const r = await getMe();
      if (r.status === 401) {
        setState("out");
        return endSession();
      }
      if (r.ok) setMe(r.data);
    } catch {
      // Keep what is on screen; the next return tries again.
    }
  };
  useEffect(() => attachRefresh(() => reloadQuietly.current()), []);

  // While signed in, the server tells us at once when staff change this player.
  // The stream closes on logout or 401 (state leaves "in") and reopens with backoff.
  const signedIn = state === "in";
  useEffect(() => {
    if (!signedIn) return undefined;
    return openLiveMe(() => reloadQuietly.current());
  }, [signedIn]);

  const onLogout = async () => {
    // Unsubscribe first: it needs the sport cookie that logout removes.
    await endSession();
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

  const chrome = <AppChrome aboveTabs={state === "in"} />;
  if (state === "loading") {
    return (
      <div className="center-note">
        <Ball className="loading-ball" />
        <p>جارٍ التحميل…</p>
        {chrome}
      </div>
    );
  }
  if (state === "out") return (<><LoginPage onSignedIn={load} />{chrome}</>);
  if (state === "error") {
    return (
      <div className="center-note">
        <p>حدث خطأ، حاول مرة أخرى</p>
        <button className="btn" onClick={load}>إعادة المحاولة</button>
        {chrome}
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
      {chrome}
      {guideOpen && <FirstVisitGuide firstname={me.student.firstname} gender={me.student.gender} onClose={closeGuide} />}
    </div>
  );
}
