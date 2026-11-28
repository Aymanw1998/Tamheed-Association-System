import { Link, usePath } from "./router.jsx";
import { SessionProvider, StaffOnly, loginPath, useSession } from "./session.jsx";
import { Toaster } from "./ui/toast.jsx";
import Library from "./screens/Library.jsx";
import Read from "./screens/Read.jsx";
import Edit from "./screens/Edit.jsx";
import Build from "./screens/Build.jsx";
import SignIn from "./screens/SignIn.jsx";
import WaveHero from "./ui/WaveHero.jsx";

// The nasheed site (owner, 2026-11-27). Guests read the library; the manager
// (nasheeds.manage) adds, edits, deletes and builds a list for the PDF.
//   /            the library        /n/:id       one nasheed
//   /new         a new nasheed      /n/:id/edit  edit one
//   /build       build a list       /login       staff sign-in
const ID = "([0-9a-fA-F]{24})";

function Screen({ path }) {
  if (path === "/login") return <SignIn />;
  if (path === "/new") return <StaffOnly><Edit /></StaffOnly>;
  if (path === "/build") return <StaffOnly><Build /></StaffOnly>;
  let m = path.match(new RegExp(`^/n/${ID}/edit$`));
  if (m) return <StaffOnly><Edit id={m[1]} /></StaffOnly>;
  m = path.match(new RegExp(`^/n/${ID}$`));
  if (m) return <Read id={m[1]} />;
  return <Library />;
}

// The header «موج الصوت» (owner, 2026-11-28): full on the library, a lower
// strip on the other screens so a nasheed's lines start near the top.
function Header({ path }) {
  const { user, loading, signOut } = useSession();
  return (
    <WaveHero compact={path !== "/"}>
      {!loading && (user ? (
        <>
          <span className="wave-user">{user.name}</span>
          <button type="button" onClick={signOut}>خروج</button>
        </>
      ) : (
        <Link to={loginPath(path + window.location.search)}>دخول</Link>
      ))}
    </WaveHero>
  );
}

function Shell() {
  const path = usePath();
  if (path === "/login") return <Screen path={path} />;
  return (
    <>
      <Header path={path} />
      <main id="main"><Screen path={path} /></main>
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
      <Toaster />
    </SessionProvider>
  );
}
