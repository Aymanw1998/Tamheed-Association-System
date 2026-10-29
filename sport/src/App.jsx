import { useEffect, useRef, useState } from "react";
import { getMe, getNotices, logout } from "./api.js";
import LoginPage from "./LoginPage.jsx";
import HomePage from "./HomePage.jsx";
import NoticesPage from "./NoticesPage.jsx";
import { markSeen, readSeen, unseenCount } from "./noticesSeen";
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
  // A notice push opens the site on /?tab=notices.
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get("tab") === "notices" ? "notices" : "home"));
  // The notices with the student they were read for: only that student's
  // list is ever shown or marked seen.
  const [noticeBox, setNoticeBox] = useState({ key: "", list: [] });
  const [noticesFailed, setNoticesFailed] = useState(false);
  const [seenBefore, setSeenBefore] = useState(0);
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
    setNoticeBox({ key: "", list: [] });
    setTab("home");
    setGuideOpen(false);
    setState("out");
  };

  // Another student signed in (on a shared phone, or in another tab): nothing
  // of the previous one stays, and the "seen" marks are this student's.
  const studentKey = me?.student?.key || "";
  const recheckedFor = useRef(null);
  const notices = noticeBox.key === studentKey ? noticeBox.list : [];
  useEffect(() => {
    setNoticesFailed(false);
    setSeenBefore(readSeen(studentKey));
  }, [studentKey]);

  // The notices are read again with every new card (sign-in, return to the
  // app, a live change). Best effort: the card shows even when they fail; a
  // 401 ends the session like /me does.
  useEffect(() => {
    if (state !== "in") return undefined;
    let gone = false;
    const owner = studentKey;
    Promise.resolve()
      .then(() => getNotices())
      .then((r) => {
        if (gone) return;
        if (r.ok && (r.data?.key || "") !== owner) {
          // The cookie now belongs to another student (signed in from another
          // tab): read the card again rather than show their notices on this
          // one, and drop the list shown so far, even if that read fails.
          setNoticeBox({ key: "", list: [] });
          if (recheckedFor.current !== owner) {
            recheckedFor.current = owner;
            reloadQuietly.current();
          }
        } else if (r.ok) {
          setNoticeBox({ key: owner, list: r.data?.notices || [] });
          setNoticesFailed(false);
        } else if (r.status === 401) {
          setNoticeBox({ key: "", list: [] });
          setState("out");
          endSession();
        } else setNoticesFailed(true);
      })
      .catch(() => !gone && setNoticesFailed(true));
    return () => {
      gone = true;
    };
  }, [state, me, studentKey]);

  // Opening the notices tab marks what is there as seen; the "new" marks stay
  // for this visit (seenBefore is read when the tab opens).
  const openTab = (next) => {
    if (next === "notices" && tab !== "notices") setSeenBefore(readSeen(studentKey));
    setTab(next);
  };
  useEffect(() => {
    if (tab === "notices" && noticeBox.key === studentKey) markSeen(noticeBox.list, studentKey);
  }, [tab, noticeBox, studentKey]);

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
      <StadiumHeader firstname={me.student.firstname} onLogout={onLogout} onHelp={() => setGuideOpen(true)} />
      <main className="content">
        {tab === "home" ? <HomePage me={me} /> : <NoticesPage notices={notices} seenBefore={seenBefore} failed={noticesFailed} />}
      </main>
      <BottomTabs tab={tab} onChange={openTab} badges={{ notices: tab === "notices" ? 0 : unseenCount(notices, readSeen(studentKey)) }} />
      {chrome}
      {guideOpen && <FirstVisitGuide firstname={me.student.firstname} gender={me.student.gender} onClose={closeGuide} />}
    </div>
  );
}
