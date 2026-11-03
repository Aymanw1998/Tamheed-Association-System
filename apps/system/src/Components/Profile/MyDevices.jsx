import React, { useEffect, useState } from "react";
import sectionStyles from "../UI/FormSection.module.css";
import styles from "./Profile.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus";
import { listMyDevices, signOutMyDevice, signOutOtherDevices } from "../../WebServer/services/user/functionsUser.jsx";

const when = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// "My devices" on the profile page: where this account is signed in. Any
// other device can be signed out from here, one at a time or all at once;
// this device signs out with the usual sign-out button.
export default function MyDevices() {
  const [devices, setDevices] = useState(null); // null while loading or after a failed read
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listMyDevices().then((r) => live && setDevices(r?.ok ? r.devices || [] : null));
    return () => { live = false; };
  }, []);

  if (!devices || devices.length === 0) return null;

  const signOutOne = async (device) => {
    const ok = await ask("change", {
      title: "تسجيل الخروج من جهاز",
      message: `سيُطلب تسجيل الدخول من جديد على «${device.label || "جهاز غير معروف"}». متابعة؟`,
      confirmText: "تسجيل الخروج",
    }).catch(() => false);
    if (!ok) return;
    setBusy(true);
    const r = await signOutMyDevice(device.sid);
    setBusy(false);
    if (!r.ok) return toast.warn(r.message || "تعذّر تسجيل الخروج");
    setDevices((list) => list.filter((d) => d.sid !== device.sid));
    toast.success("تم تسجيل الخروج من الجهاز");
  };

  const signOutOthers = async () => {
    const ok = await ask("change", {
      title: "تسجيل الخروج من الأجهزة الأخرى",
      message: "ستبقى متصلًا على هذا الجهاز فقط. متابعة؟",
      confirmText: "تسجيل الخروج",
    }).catch(() => false);
    if (!ok) return;
    setBusy(true);
    const r = await signOutOtherDevices();
    setBusy(false);
    if (!r.ok) return toast.warn(r.message || "تعذّر تسجيل الخروج");
    setDevices((list) => list.filter((d) => d.current));
    toast.success("تم تسجيل الخروج من الأجهزة الأخرى");
  };

  const others = devices.filter((d) => !d.current).length;

  return (
    <fieldset className={sectionStyles.formSection} data-testid="my-devices">
      <legend>الأجهزة المتصلة</legend>
      <ul className={styles.deviceList}>
        {devices.map((d) => (
          <li key={d.sid} className={styles.deviceRow} data-testid="device-row">
            <div>
              <strong>{d.label || "جهاز غير معروف"}</strong>
              {d.current && <span className={styles.deviceCurrent}>هذا الجهاز</span>}
              <small className={styles.deviceMeta}>آخر نشاط: {when(d.lastSeenAt)}</small>
            </div>
            {!d.current && (
              <button type="button" className={styles.deviceSignOut} disabled={busy} onClick={() => signOutOne(d)}>
                تسجيل الخروج
              </button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <button type="button" className={styles.deviceSignOut} disabled={busy} onClick={signOutOthers} data-testid="sign-out-others">
          تسجيل الخروج من كل الأجهزة الأخرى
        </button>
      )}
    </fieldset>
  );
}
