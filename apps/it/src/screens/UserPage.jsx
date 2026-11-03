import { useCallback, useEffect, useState } from "react";
import {
  endSession, errorText, getPassword, getSessions, getUser, resetPassword, setRole, unlockUser,
} from "../api";
import { Link } from "../router.jsx";
import { ROLES, ROOMS, roleLabel } from "../strings";
import Avatar from "../ui/Avatar.jsx";
import PermissionsEditor from "../ui/PermissionsEditor.jsx";
import { passportSrc } from "../ui/passportPhoto";
import { toast } from "../ui/toast.jsx";

const RANK = { "ادارة": 3, "مرشد": 2, "مساعد": 1 };
// The highest everyday role among the record's `role` and `roles`.
const roleOf = (user) => {
  const held = [user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])].filter((r) => RANK[r]);
  return held.sort((a, b) => RANK[b] - RANK[a])[0] || "";
};

const when = (value) => (value ? new Date(value).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) : "—");

// One user: role, permissions, password, unlock and signed-in devices.
// Every action is decided by the server; a refusal is shown as its text.
export default function UserPage({ tz }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [role, setRoleValue] = useState("");
  const [hasPassword, setHasPassword] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [devices, setDevices] = useState(null);

  const loadUser = useCallback(async () => {
    const res = await getUser(tz);
    if (res.status === 404) return setError("المستخدم غير موجود");
    if (!res.ok) return setError(errorText(res));
    setRecord(res.data);
    setRoleValue(roleOf(res.data.user));
  }, [tz]);

  const loadDevices = useCallback(async () => {
    const res = await getSessions(tz);
    setDevices(res.ok ? res.data.devices || [] : []);
  }, [tz]);

  useEffect(() => { loadUser(); loadDevices(); }, [loadUser, loadDevices]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!record) return <p role="status">…</p>;

  const { user, room } = record;
  const name = `${user.firstname || ""} ${user.lastname || ""}`.trim();
  const current = roleOf(user);

  const run = async (call, okText, after) => {
    const res = await call();
    if (!res.ok) { toast.error(errorText(res)); return res; }
    if (okText) toast.success(okText);
    if (after) await after(res);
    return res;
  };

  const saveRole = () => run(() => setRole(tz, role), "تم تغيير الدور", loadUser);
  const viewPassword = async () => {
    const res = await run(() => getPassword(tz));
    if (res.ok) setHasPassword(Boolean(res.data.hasPassword));
  };
  const savePassword = async (event) => {
    event.preventDefault();
    const res = await run(() => resetPassword(tz, newPassword), "تم تعيين كلمة المرور");
    if (res.ok) { setNewPassword(""); setHasPassword(null); }
  };
  const unlock = () => run(() => unlockUser(tz), "تم رفع الحظر", loadUser);
  const endDevice = (sid) => run(() => endSession(tz, sid), "تم إنهاء الجلسة", loadDevices);

  return (
    <section className="user-page">
      <p><Link to="/">→ المستخدمون</Link></p>
      <header className="user-head">
        <Avatar src={passportSrc(user.photo) || ""} name={name} size={64} />
        <div>
          <h1>{name || tz}</h1>
          <small className="muted">{tz}</small>
          <div className="badges">
            <span className="badge">{ROOMS[room] || room}</span>
            <span className="badge">{roleLabel(current)}</span>
            {user.lockedAt && <span className="badge danger">الحساب مقفل</span>}
          </div>
        </div>
      </header>

      <div className="card">
        <h2>الدور</h2>
        <div className="row">
          <select name="role" aria-label="الدور" value={role} onChange={(e) => setRoleValue(e.target.value)}>
            <option value="">بدون دور</option>
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <button type="button" className="primary" onClick={saveRole} disabled={!role || role === current}>حفظ الدور</button>
        </div>
      </div>

      <div className="card">
        <h2>الصلاحيات</h2>
        <PermissionsEditor tz={tz} />
      </div>

      <div className="card">
        <h2>كلمة المرور</h2>
        <div className="row">
          <button type="button" onClick={viewPassword}>عرض كلمة المرور</button>
          {hasPassword !== null && <span>{hasPassword ? "يوجد كلمة مرور" : "لا توجد كلمة مرور"}</span>}
        </div>
        <form className="row" onSubmit={savePassword}>
          <input name="newPassword" type="password" autoComplete="new-password" placeholder="كلمة مرور جديدة (8 إلى 128 حرفًا)" aria-label="كلمة مرور جديدة" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button type="submit" disabled={!newPassword}>تعيين كلمة المرور</button>
        </form>
      </div>

      {user.lockedAt && (
        <div className="card">
          <h2>الحظر</h2>
          <p>الحساب مقفل منذ {when(user.lockedAt)}</p>
          <button type="button" onClick={unlock}>رفع الحظر</button>
        </div>
      )}

      <div className="card">
        <h2>الأجهزة المسجّلة</h2>
        {devices === null ? <p>…</p> : devices.length === 0 ? <p>لا توجد أجهزة مسجّلة.</p> : (
          <ul className="list">
            {devices.map((device) => (
              <li key={device.sid} className="device">
                <span className="grow">
                  <strong>{device.label || "جهاز"}</strong>
                  <small className="muted">بدأت: {when(device.startedAt)} — آخر نشاط: {when(device.lastSeenAt)}</small>
                </span>
                <button type="button" onClick={() => endDevice(device.sid)}>إنهاء الجلسة</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
