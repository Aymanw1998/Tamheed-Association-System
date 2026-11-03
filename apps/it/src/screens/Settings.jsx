import { useEffect, useState } from "react";
import { errorText, forceReleaseLock, getPushSettings, recoverSystem, setPushEnabled } from "../api";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import { toast } from "../ui/toast.jsx";

const LOCK_ERRORS = { BAD_KEY: "مفتاح القفل غير صالح" };
const RECOVER_ERRORS = {
  RECOVERY_NOT_ALLOWED: "لا يمكن الاستعادة بعد: يجب أن تكون هناك 3 محاولات دخول فاشلة على الأقل لحساب النظام.",
  RECOVERY_COOLDOWN: "تمت استعادة الحساب قبل قليل. حاول مرة أخرى بعد 10 دقائق.",
  RATE_LIMITED: "عدد المحاولات كبير. حاول مرة أخرى لاحقًا.",
};

// Settings: force-release a stuck lock, push notifications, system account recovery.
export default function Settings() {
  const [push, setPush] = useState(null);
  const [pushError, setPushError] = useState("");
  const [lockKey, setLockKey] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let live = true;
    getPushSettings().then((res) => {
      if (!live) return;
      if (res.ok) setPush(Boolean(res.data.enabled)); else setPushError(errorText(res));
    });
    return () => { live = false; };
  }, []);

  const togglePush = async (event) => {
    const enabled = event.target.checked;
    setPushError("");
    const res = await setPushEnabled(enabled);
    if (!res.ok) return toast.error(errorText(res));
    setPush(Boolean(res.data.enabled));
    toast.success(res.data.enabled ? "تم تفعيل الإشعارات الفورية" : "تم إيقاف الإشعارات الفورية");
  };

  const release = async (event) => {
    event.preventDefault();
    const res = await forceReleaseLock(lockKey.trim());
    if (!res.ok) return toast.error(errorText(res, LOCK_ERRORS));
    setLockKey("");
    toast.success("تم تحرير القفل");
  };

  const recover = async () => {
    setAsking(false);
    const res = await recoverSystem();
    if (res.ok) toast.success("تم إرسال كلمة مرور مؤقتة إلى بريد حساب النظام.");
    else toast.error(errorText(res, RECOVER_ERRORS));
  };

  return (
    <section>
      <h1>الإعدادات</h1>

      <div className="card">
        <h2>الإشعارات الفورية</h2>
        {push === null && !pushError ? <p>…</p> : (
          <label className="check">
            <input name="push" type="checkbox" checked={Boolean(push)} disabled={push === null} onChange={togglePush} />
            تفعيل الإشعارات الفورية (Push)
          </label>
        )}
        {pushError && <p role="alert" className="error">{pushError}</p>}
      </div>

      <div className="card">
        <h2>تحرير قفل عالق</h2>
        <form data-form="lock" className="row" onSubmit={release}>
          <input name="lockKey" placeholder="مفتاح القفل" aria-label="مفتاح القفل" value={lockKey} onChange={(e) => setLockKey(e.target.value)} required />
          <button type="submit" className="primary">تحرير القفل</button>
        </form>
      </div>

      <div className="card">
        <h2>حساب النظام</h2>
        <p className="muted">تُرسل كلمة مرور مؤقتة إلى بريد حساب النظام فقط.</p>
        <button type="button" onClick={() => setAsking(true)}>استعادة حساب النظام</button>
      </div>

      {asking && (
        <ConfirmDialog
          title="استعادة حساب النظام"
          message="ستُرسل كلمة مرور مؤقتة إلى بريد حساب النظام فقط، وسيُطلب تغييرها عند الدخول. هل تريد المتابعة؟"
          onCancel={() => setAsking(false)}
          onConfirm={recover}
        />
      )}
    </section>
  );
}
