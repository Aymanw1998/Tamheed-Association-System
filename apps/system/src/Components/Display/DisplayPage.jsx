import React, { useEffect, useRef, useState } from "react";
import styles from "./Display.module.css";
import { fetchDisplayFeed } from "../../WebServer/services/display/functionsDisplay.jsx";
import { DAY_NAMES, clearFeed, clockOffset, israelDayMinute, loadStored, saveFeed } from "./displayBoard";
import WeekLayout from "./WeekLayout";
import TodayLayout from "./TodayLayout";
import RotateLayout from "./RotateLayout";
import RoomsLayout from "./RoomsLayout";
import { boardDay, boardTitle } from "./roomBoard";

// The wall display (owner, 2026-11-12), opened from /display#<secret> with no
// sign-in. It shows the program in the screen's layout, refreshes every
// minute, keeps the last program through network trouble (also across a
// reload, from the copy kept on the TV), and closes only when the server
// says the link is no longer valid.
const REFRESH_MS = 60 * 1000;
const TICK_MS = 15 * 1000;
const STALE_MS = 5 * 60 * 1000;
const LAYOUTS = { week: WeekLayout, today: TodayLayout, rotate: RotateLayout, rooms: RoomsLayout };
const DAY_MS = 24 * 60 * 60 * 1000;

// The title and the date in the top bar. The rooms board may show a coming
// day (after the last lesson of today), so it names that day and its date.
function headerOf(feed, at, serverMs) {
  if (feed.layout === "rooms") {
    const board = boardDay(feed.lessons, at.day, at.minute);
    if (board && board.ahead > 0) {
      const then = israelDayMinute(serverMs + board.ahead * DAY_MS);
      return { title: `تمهيد · ${boardTitle(board)}`, date: `${DAY_NAMES[then.day - 1]} ${then.date}` };
    }
    return { title: "تمهيد · برنامج اليوم", date: `${DAY_NAMES[at.day - 1]} ${at.date}` };
  }
  return {
    title: feed.layout === "today" ? "تمهيد · برنامج اليوم" : "تمهيد · برنامج الأسبوع",
    date: `${DAY_NAMES[at.day - 1]} ${at.date}`,
  };
}
const CLOSED_TEXT = "رابط هذه الشاشة لم يعد صالحًا. اطلبوا رابطًا جديدًا من الجمعية.";
const LOADING_TEXT = "جارٍ تحميل البرنامج…";

const readToken = () => {
  try { return String(window.location.hash || "").replace(/^#/, "").trim(); } catch (e) { return ""; }
};

const Message = ({ text, muted }) => (
  <div className={styles.board}><div className={muted ? `${styles.center} ${styles.muted}` : styles.center}>{text}</div></div>
);

function Board({ token }) {
  // After a restart with no network the stored copy brings back its own save
  // time and the server clock correction measured when it was saved.
  const [stored] = useState(() => loadStored(Date.now(), token));
  const [feed, setFeed] = useState(stored ? stored.feed : null);
  const [closed, setClosed] = useState(false);
  const [offset, setOffset] = useState(stored ? clockOffset(stored.feed.serverTime, stored.savedAt) : 0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const lastOk = useRef(stored ? stored.savedAt : Date.now());
  const [stale, setStale] = useState(() => Date.now() - lastOk.current > STALE_MS);

  useEffect(() => {
    let alive = true;
    const closeLink = () => { clearFeed(token); setFeed(null); setClosed(true); };
    const pull = async () => {
      if (!token) { closeLink(); return; }
      let res;
      try { res = await fetchDisplayFeed(token); } catch (e) { res = { ok: false }; }
      if (!alive) return;
      if (res && res.ok && res.feed) {
        const local = Date.now();
        lastOk.current = local;
        saveFeed(res.feed, local, token);
        setFeed(res.feed);
        setOffset(clockOffset(res.feed.serverTime, local));
        setNowMs(local);
        setClosed(false);
        setStale(false);
      } else if (res && res.closed) {
        closeLink();
      }
    };
    pull();
    const id = setInterval(pull, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  useEffect(() => {
    const id = setInterval(() => {
      const local = Date.now();
      setNowMs(local);
      setStale(local - lastOk.current > STALE_MS);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (closed) return <Message text={CLOSED_TEXT} />;
  if (!feed) return <Message text={LOADING_TEXT} muted />;

  const at = israelDayMinute(nowMs + offset);
  const Layout = LAYOUTS[feed.layout] || WeekLayout;
  const head = headerOf(feed, at, nowMs + offset);
  const updated = Date.parse(feed.serverTime);
  return (
    <div className={styles.board}>
      <header className={styles.top}>
        <span className={styles.title}>{head.title}</span>
        <span className={styles.date}>{head.date}</span>
        <span className={styles.clock}>{at.time}</span>
      </header>
      <main className={styles.body}>
        <Layout lessons={feed.lessons} today={at.day} minute={at.minute} />
      </main>
      {stale && Number.isFinite(updated) ? <div className={styles.stale}>{`آخر تحديث ${israelDayMinute(updated).date} ${israelDayMinute(updated).time}`}</div> : null}
    </div>
  );
}

// A crash must not leave an error on the wall: show the loading text, drop
// the stored copy and try again in a minute.
class DisplayBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    console.error("Display crashed:", error);
    // The stored copy may be what crashed: drop it, so the reload fetches.
    clearFeed(this.props.token);
    this.timer = setTimeout(() => { try { window.location.reload(); } catch (e) { /* stay */ } }, REFRESH_MS);
  }
  componentWillUnmount() { clearTimeout(this.timer); }
  render() {
    return this.state.failed ? <Message text={LOADING_TEXT} muted /> : this.props.children;
  }
}

export default function DisplayPage() {
  const [token] = useState(readToken);
  return <DisplayBoundary token={token}><Board token={token} /></DisplayBoundary>;
}
