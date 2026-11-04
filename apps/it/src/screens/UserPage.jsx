import { useCallback, useEffect, useState } from "react";
import {
  deleteUser, endSession, errorText, getPassword, getSessions, getUser, moveUser, resetPassword, setRole, unlockUser, setRequestAlerts } from "../api";
import { Link, navigate } from "../router.jsx";
import { ROLES, ROOMS, accountText, fillText, roleLabel } from "../strings";
import Avatar from "../ui/Avatar.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import EyeIcon from "../ui/EyeIcon.jsx";
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [devices, setDevices] = useState(null);
  const [asking, setAsking] = useState(null); // "disable" | "remove"

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

  const toggleRequestAlerts = (event) => run(() => setRequestAlerts(tz, event.target.checked), "تم الحفظ", loadUser);

  const saveRole = () => run(() => setRole(tz, role), "تم تغيير الدور", loadUser);
  const viewPassword = async () => {
    const res = await run(() => getPassword(tz));
    if (res.ok) setHasPassword(Boolean(res.data.hasPassword));
  };
  const savePassword = async (event) => {
    event.preventDefault();
    // Two fields that must match, as in the everyday app (owner, 2026-11-03).
    if (newPassword !== confirmPassword) return toast.error("كلمتا المرور غير متطابقتين");
    const res = await run(() => resetPassword(tz, newPassword), "تم تعيين كلمة المرور");
    if (res.ok) { setNewPassword(""); setConfirmPassword(""); setHasPassword(null); }
  };
  const unlock = () => run(() => unlockUser(tz), "تم رفع الحظر", loadUser);
  const endDevice = (sid) => run(() => endSession(tz, sid), "تم إنهاء الجلسة", loadDevices);

  // Account state: disable (to noActive), enable or approve (to active, with a
  // role when the user has none), delete. The server refuses another IT user.
  const disable = () => run(() => moveUser(tz, room, "noActive"), accountText.disabled, loadUser);
  const activate = () => {
    const chosen = current || role;
    if (!chosen) return toast.warn(accountText.needRole);
    const okText = room === "waiting" ? accountText.approved : accountText.enabled;
    return run(() => moveUser(tz, room, "active", current ? undefined : chosen), okText, loadUser);
  };
  const remove = async () => {
    const res = await run(() => deleteUser(tz, room), accountText.removed);
    if (res.ok) navigate("/");
  };

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
        <h2>طلبات الانضمام</h2>
        <label className="check">
          <input name="requestAlerts" type="checkbox" checked={user.receivesRequestAlerts === true} onChange={toggleRequestAlerts} />
          يتلقى تنبيهات طلبات الانضمام الجديدة (لمن يملك صلاحية الموافقة)
        </label>
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
        <form className="password-form" onSubmit={savePassword}>
          <label>
            كلمة المرور الجديدة
            <span className="password-wrap">
              <input name="newPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                aria-pressed={showPassword}
              >
                <EyeIcon open={showPassword} />
              </button>
            </span>
          </label>
          <label>
            تأكيد كلمة المرور
            <input name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </label>
          <button type="submit" className="primary" disabled={!newPassword || !confirmPassword}>تعيين كلمة المرور</button>
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

      <div className="card" data-card="account">
        <h2>{accountText.title}</h2>
        <p className="muted">{accountText.hint[room]}</p>
        <div className="row account-actions">
          {room === "active" && <button type="button" onClick={() => setAsking("disable")}>{accountText.disable}</button>}
          {room === "noActive" && <button type="button" className="primary" onClick={activate}>{accountText.enable}</button>}
          {room === "waiting" && <button type="button" className="primary" onClick={activate}>{accountText.approve}</button>}
          <button type="button" className="danger" onClick={() => setAsking("remove")}>{accountText.remove}</button>
        </div>
      </div>

      {asking && (
        <ConfirmDialog
          title={asking === "remove" ? accountText.remove : accountText.disable}
          message={fillText(asking === "remove" ? accountText.removeConfirm : accountText.disableConfirm, { name: name || tz })}
          danger
          onCancel={() => setAsking(null)}
          onConfirm={() => { const action = asking; setAsking(null); if (action === "remove") remove(); else disable(); }}
        />
      )}
    </section>
  );
}
