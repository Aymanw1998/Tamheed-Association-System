import React, { useEffect, useRef, useState } from "react";
import sectionStyles from "../UI/FormSection.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { canStored } from "../../utils/session";
import {
  getPushSettings, isSubscribed, needsHomeScreen, pushOnServer, pushSupported,
  resyncStaff, setPushSettings, subscribeStaff, unsubscribeStaff,
} from "../../pwa/pushOptIn";

// Phone notifications on the profile page: the system-wide switch (only for
// whoever manages permissions) and this device's own checkbox, shown only
// while the system sends notifications.
export default function PhoneNotifications() {
  const isManager = canStored("permissions.manage");
  const [serverOn, setServerOn] = useState(null); // null while loading
  const [system, setSystem] = useState(null); // { enabled, keysFrom } for the manager
  const [systemBusy, setSystemBusy] = useState(false);
  const [mine, setMine] = useState(false);
  const [mineBusy, setMineBusy] = useState(false);
  // Numbers each read of the switch; a switch made here bumps it too, so an
  // answer that was on its way before then is dropped.
  const latest = useRef(0);

  useEffect(() => {
    let live = true;
    isSubscribed().then((on) => {
      if (!live) return;
      setMine(on);
      if (on) resyncStaff(); // repairs an earlier failed POST; idempotent on the server
    });
    return () => { live = false; };
  }, []);

  // Read again whenever the page comes back to the screen: another manager
  // may have switched it, or the first read failed offline. Only the newest
  // read is kept.
  useEffect(() => {
    let live = true;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      const n = ++latest.current;
      pushOnServer().then((on) => live && n === latest.current && setServerOn(on));
      if (isManager) getPushSettings().then((r) => live && n === latest.current && r?.ok && setSystem(r)).catch(() => {});
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", check);
    };
  }, [isManager]);

  const toggleSystem = async () => {
    setSystemBusy(true);
    latest.current += 1;
    try {
      const r = await setPushSettings(!system.enabled);
      if (!r?.ok) throw new Error("failed");
      latest.current += 1;
      setSystem(r);
      setServerOn(r.enabled);
      toast.success(r.enabled ? "تم تفعيل إشعارات الهاتف في النظام" : "تم إيقاف إشعارات الهاتف في النظام");
    } catch {
      toast.warn("تعذّر تغيير إعداد الإشعارات");
    } finally {
      setSystemBusy(false);
    }
  };

  const toggleMine = async () => {
    setMineBusy(true);
    const res = mine ? await unsubscribeStaff() : await subscribeStaff();
    setMineBusy(false);
    if (!res.ok) {
      toast.warn(res.reason === "denied" ? "لم يُسمح بالإشعارات في إعدادات المتصفح" : "تعذّر تغيير إعداد الإشعارات");
      return;
    }
    setMine(!mine);
  };

  // For a manager the switch's own state is the newest word.
  const on = system ? system.enabled : serverOn;
  const showSystem = isManager && system;
  const showMine = on && pushSupported();
  const showHomeHint = on && !pushSupported() && needsHomeScreen();
  if (!showSystem && !showMine && !showHomeHint) return null;

  return (
    <fieldset className={sectionStyles.formSection} data-testid="phone-notifications">
      <legend>إشعارات الهاتف</legend>
      {showSystem && (
        <>
          <label>
            <input type="checkbox" checked={system.enabled} disabled={systemBusy} onChange={toggleSystem} data-testid="push-system" />
            {" "}إشعارات الهاتف في النظام كله (للطاقم ولاعبي الرياضة)
          </label>
          <small style={{ display: "block", color: "#6b7280", marginBottom: 8 }}>
            {system.enabled
              ? "كل مستخدم يفعّلها لهاتفه من ملفه الشخصي."
              : "عند الإيقاف لا يُرسل أي إشعار، ويختفي زر التفعيل من الهواتف."}
          </small>
        </>
      )}
      {showMine && (
        <label>
          <input type="checkbox" checked={mine} disabled={mineBusy} onChange={toggleMine} data-testid="push-mine" />
          {" "}إشعارات الهاتف على هذا الجهاز
        </label>
      )}
      {showHomeHint && (
        <small style={{ display: "block", color: "#6b7280" }} data-testid="push-home-hint">
          على iPhone: افتح الموقع في Safari، اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتحه من هناك لتفعيل الإشعارات.
        </small>
      )}
    </fieldset>
  );
}
