import { useCallback, useEffect, useState } from "react";
import { getMe, logout, setPasswordChangeHandler, setSignedOutHandler, systemPass } from "./api";
import { usePath } from "./router.jsx";
import { openSite, systemUrlWithPass, takePassFromAddress } from "./siteLink";
import Header from "./ui/Header.jsx";
import PasskeyOffer from "./ui/PasskeyOffer.jsx";
import { Toaster, toast } from "./ui/toast.jsx";
import SignIn from "./screens/SignIn.jsx";
import Users from "./screens/Users.jsx";
import UserPage from "./screens/UserPage.jsx";
import Members from "./screens/Members.jsx";
import Audit from "./screens/Audit.jsx";
import Storage from "./screens/Storage.jsx";
import Settings from "./screens/Settings.jsx";
import RoleDefaults from "./screens/RoleDefaults.jsx";
import ChangePassword from "./screens/ChangePassword.jsx";

const NAV = [
  { to: "/", label: "المستخدمون" },
  { to: "/roles", label: "صلاحيات الأدوار" },
  { to: "/audit", label: "سجل التغييرات" },
  { to: "/storage", label: "التخزين" },
  { to: "/settings", label: "الإعدادات" },
];

function Screen({ path, me }) {
  const user = /^\/users\/([^/]+)$/.exec(path);
  if (user) return <UserPage key={user[1]} tz={decodeURIComponent(user[1])} />;
  if (path === "/roles") return <RoleDefaults />;
  if (path === "/audit") return <Audit />;
  if (path === "/storage") return <Storage />;
  if (path === "/settings") return <Settings />;
  // The IT users screen: the system account and the «مدير IT» users (the server checks too).
  if (path === "/members" && (me.isSystem || me.isItManager)) return <Members me={me} />;
  return <Users />;
}

export default function App() {
  const [state, setState] = useState("loading"); // loading | out | in | error
  const [me, setMe] = useState(null);
  // A pass from the everyday app is taken off the address before anything else.
  const [pass] = useState(takePassFromAddress);
  // «النظام» for every IT user: with no everyday role he works there unseen.
  const [hasSystem, setHasSystem] = useState(false);
  const path = usePath();

  const loadMe = useCallback(async () => {
    const res = await getMe();
    if (res.status === 401) return setState("out");
    if (!res.ok) return setState("error");
    setMe(res.data);
    setHasSystem(true);
    setState("in");
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => { setMe(null); setState("out"); });
    // Any refusal "change the temporary password first" opens that screen.
    setPasswordChangeHandler(() => setMe((prev) => (prev ? { ...prev, mustChangePassword: true } : prev)));
    loadMe();
    return () => { setSignedOutHandler(null); setPasswordChangeHandler(null); };
  }, [loadMe]);

  const openSystem = async () => {
    // The pass is asked for only now, when the button is clicked.
    const res = await systemPass();
    if (!res.ok || !res.data.pass) {
      toast.error("تعذّر فتح النظام");
      return setHasSystem(false);
    }
    // A new tab with the full address (an installed app opens the everyday app).
    openSite(systemUrlWithPass(res.data.pass));
  };

  const signOut = async () => {
    await logout();
    setMe(null);
    setState("out");
    window.history.replaceState(null, "", "/");
  };

  if (state === "loading") return <p className="center" role="status">…</p>;
  if (state === "error") return <p className="center" role="alert">تعذّر الاتصال بالخادم. <button type="button" onClick={loadMe}>إعادة المحاولة</button></p>;
  if (state === "out") return <><SignIn pass={pass} onSignedIn={loadMe} /><Toaster /></>;
  // A temporary password: only «تغيير كلمة المرور» until it is changed (the server refuses the rest).
  if (me.mustChangePassword) return <><ChangePassword onDone={loadMe} onSignOut={signOut} /><Toaster /></>;

  // The system account is shown by its name only, never by its ID number.
  const links = me.isSystem || me.isItManager ? [...NAV, { to: "/members", label: "مستخدمو IT" }] : NAV;
  return (
    <div className="shell">
      <Header links={links} path={path} me={me} onOpenSystem={hasSystem ? openSystem : null} onSignOut={signOut} />
      <main className="page">
        <PasskeyOffer />
        <Screen path={path} me={me} />
      </main>
      <Toaster />
    </div>
  );
}
