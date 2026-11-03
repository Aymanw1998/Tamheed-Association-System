import React, { useEffect, useState } from "react";
import sectionStyles from "../UI/FormSection.module.css";
import { toast } from "../../ALERT/SystemToasts.jsx";
import {
  isSubscribed, needsHomeScreen, pushOnServer, pushSupported,
  resyncStaff, subscribeStaff, unsubscribeStaff,
} from "../../pwa/pushOptIn";

// Phone notifications on the profile page: this device's own checkbox, shown
// only while the system sends notifications. The system-wide switch is an IT
// setting, on the IT site.
export default function PhoneNotifications() {
  const [serverOn, setServerOn] = useState(null); // null while loading
  const [mine, setMine] = useState(false);
  const [mineBusy, setMineBusy] = useState(false);

  useEffect(() => {
    let live = true;
    isSubscribed().then((on) => {
      if (!live) return;
      setMine(on);
      if (on) resyncStaff(); // repairs an earlier failed POST; idempotent on the server
    });
    return () => { live = false; };
  }, []);

  // Read again whenever the page comes back to the screen: IT may have
  // switched it, or the first read failed offline.
  useEffect(() => {
    let live = true;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      pushOnServer().then((on) => live && setServerOn(on));
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

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

  const showMine = serverOn && pushSupported();
  const showHomeHint = serverOn && !pushSupported() && needsHomeScreen();
  if (!showMine && !showHomeHint) return null;

  return (
    <fieldset className={sectionStyles.formSection} data-testid="phone-notifications">
      <legend>إشعارات الهاتف</legend>
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
