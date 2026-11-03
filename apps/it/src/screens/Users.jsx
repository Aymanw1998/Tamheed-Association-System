import { useEffect, useMemo, useState } from "react";
import { errorText, getUsers } from "../api";
import { Link } from "../router.jsx";
import { ROLES, ROOMS, roleLabel } from "../strings";
import Avatar from "../ui/Avatar.jsx";
import FilterDialog from "../ui/FilterDialog.jsx";
import { passportSrc } from "../ui/passportPhoto";

const NO_FILTER = { room: "", role: "" };

// Every user in every room, with search and a «فلتر» window.
export default function Users() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(NO_FILTER);

  useEffect(() => {
    let live = true;
    getUsers().then((res) => {
      if (!live) return;
      if (res.ok) setUsers(res.data.users || []);
      else setError(errorText(res));
    });
    return () => { live = false; };
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (users || []).filter((user) => {
      if (filter.room && user.room !== filter.room) return false;
      if (filter.role === "none" ? user.role : (filter.role && user.role !== filter.role)) return false;
      if (!needle) return true;
      return `${user.firstname} ${user.lastname} ${user.tz}`.toLowerCase().includes(needle);
    });
  }, [users, query, filter]);

  const count = (filter.room ? 1 : 0) + (filter.role ? 1 : 0);
  const set = (key) => (event) => setFilter((prev) => ({ ...prev, [key]: event.target.value }));

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!users) return <p role="status">…</p>;

  return (
    <section>
      <h1>المستخدمون</h1>
      <div className="toolbar">
        <input type="search" placeholder="بحث بالاسم أو رقم الهوية" aria-label="بحث" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FilterDialog count={count} onClear={() => setFilter(NO_FILTER)}>
          <label>
            الحالة
            <select name="room" value={filter.room} onChange={set("room")}>
              <option value="">الكل</option>
              {Object.entries(ROOMS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>
            الدور
            <select name="role" value={filter.role} onChange={set("role")}>
              <option value="">الكل</option>
              {ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
              <option value="none">بدون دور</option>
            </select>
          </label>
        </FilterDialog>
      </div>
      <p className="muted">{shown.length} من {users.length}</p>
      {shown.length === 0 ? (
        <p>لا يوجد مستخدمون.</p>
      ) : (
        <ul className="list">
          {shown.map((user) => {
            const name = `${user.firstname} ${user.lastname}`.trim();
            return (
              <li key={`${user.room}-${user.tz}`} data-user={user.tz}>
                <Link to={`/users/${encodeURIComponent(user.tz)}`} className="row-link">
                  <Avatar src={passportSrc(user.photo) || ""} name={name} />
                  <span className="grow">
                    <strong>{name || user.tz}</strong>
                    <small className="muted">{user.tz}</small>
                  </span>
                  <span className="badges">
                    <span className="badge">{roleLabel(user.role)}</span>
                    <span className="badge">{ROOMS[user.room] || user.room}</span>
                    {user.isIT && <span className="badge info">IT</span>}
                    {user.lockedAt && <span className="badge danger">مقفل</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
