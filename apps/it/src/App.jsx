import { useCallback, useEffect, useState } from "react";
import { getMe, logout, setSignedOutHandler, systemPass } from "./api";
import { Link, usePath } from "./router.jsx";
import { goTo, systemUrlWithPass, takePassFromAddress } from "./siteLink";
import Avatar from "./ui/Avatar.jsx";
import { passportSrc } from "./ui/passportPhoto";
import SignIn from "./screens/SignIn.jsx";
import Users from "./screens/Users.jsx";
import UserPage from "./screens/UserPage.jsx";
import Members from "./screens/Members.jsx";
import Audit from "./screens/Audit.jsx";
import Storage from "./screens/Storage.jsx";
import Settings from "./screens/Settings.jsx";

const NAV = [
  { to: "/", label: "المستخدمون" },
  { to: "/audit", label: "سجل التغييرات" },
  { to: "/storage", label: "التخزين" },
  { to: "/settings", label: "الإعدادات" },
];

function Screen({ path, me }) {
  const user = /^\/users\/([^/]+)$/.exec(path);
  if (user) return <UserPage key={user[1]} tz={decodeURIComponent(user[1])} />;
  if (path === "/audit") return <Audit />;
  if (path === "/storage") return <Storage />;
  if (path === "/settings") return <Settings />;
  // The IT users screen exists only for the system account (the server checks too).
  if (path === "/members" && me.isSystem) return <Members />;
  return <Users />;
}

export default function App() {
  const [state, setState] = useState("loading"); // loading | out | in | error
  const [me, setMe] = useState(null);
  // A pass from the everyday app is taken off the address before anything else.
  const [pass] = useState(takePassFromAddress);
  const [hasSystem, setHasSystem] = useState(false);
  const path = usePath();

  const loadMe = useCallback(async () => {
    const res = await getMe();
    if (res.status === 401) return setState("out");
    if (!res.ok) return setState("error");
    setMe(res.data);
    setState("in");
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => { setMe(null); setState("out"); });
    loadMe();
    return () => setSignedOutHandler(null);
  }, [loadMe]);

  // «النظام» only for a user who has an everyday role too: the server says (403 = no).
  useEffect(() => {
    if (state !== "in") { setHasSystem(false); return undefined; }
    let live = true;
    systemPass().then((res) => { if (live) setHasSystem(res.ok); });
    return () => { live = false; };
  }, [state]);

  const openSystem = async () => {
    const res = await systemPass();
    if (!res.ok || !res.data.pass) return setHasSystem(false);
    goTo(systemUrlWithPass(res.data.pass));
  };

  const signOut = async () => {
    await logout();
    setMe(null);
    setState("out");
    window.history.replaceState(null, "", "/");
  };

  if (state === "loading") return <p className="center" role="status">…</p>;
  if (state === "error") return <p className="center" role="alert">تعذّر الاتصال بالخادم. <button type="button" onClick={loadMe}>إعادة المحاولة</button></p>;
  if (state === "out") return <SignIn pass={pass} onSignedIn={loadMe} />;

  // The system account is shown by its name only, never by its ID number.
  const links = me.isSystem ? [...NAV, { to: "/members", label: "مستخدمو IT" }] : NAV;
  return (
    <div className="shell">
      <header className="top">
        <strong className="brand">قسم IT</strong>
        <nav aria-label="القائمة">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className={path === link.to || (link.to === "/" && path.startsWith("/users")) ? "active" : ""}>{link.label}</Link>
          ))}
        </nav>
        <span className="me">
          <Avatar src={passportSrc(me.photo) || ""} name={me.name} size={28} />
          <span>{me.name}</span>
        </span>
        {hasSystem && <button type="button" onClick={openSystem}>النظام</button>}
        <button type="button" onClick={signOut}>تسجيل الخروج</button>
      </header>
      <main className="page">
        <Screen path={path} me={me} />
      </main>
    </div>
  );
}
