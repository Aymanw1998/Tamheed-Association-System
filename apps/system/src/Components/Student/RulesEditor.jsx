import React, { useEffect, useState } from "react";
import Button from "../UI/Button.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus.js";
import { getRules, publishRules } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { DEFAULT_RULES } from "./defaultRules";

// The rules a parent signs on the registration link. Publishing makes a new
// version; those who already signed keep the version they signed.
export default function RulesEditor() {
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getRules().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setVersion(res.rules?.version || 0);
        setText(res.rules ? (res.rules.text ?? "") : DEFAULT_RULES);
        setSaved(res.rules?.text || "");
      } else setError(res.message || "تعذّر تحميل نظام الجمعية");
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const publish = async () => {
    let confirmed = false;
    try {
      confirmed = await ask("", {
        title: "نشر نظام الجمعية",
        message: text.trim()
          ? "من الآن سيوقّع الأهل الجدد على هذا النص. من وقّع سابقًا يبقى توقيعه على النص الذي وقّعه."
          : "النص فارغ: سيتوقف رابط التسجيل عن استقبال طلبات الأهل. هل تريد المتابعة؟",
        confirmText: "نشر",
        cancelText: "إلغاء",
      });
    } catch {
      toast.error("تعذّر فتح نافذة التأكيد، حاول مرة أخرى.");
      return;
    }
    if (!confirmed) return;
    setBusy(true);
    const res = await publishRules(text);
    setBusy(false);
    if (!res.ok) return toast.error(res.message);
    setVersion(res.rules.version);
    setSaved(res.rules.text);
    toast.success("تم نشر نظام الجمعية");
  };

  if (!loaded) return null;
  if (error) return <p role="alert">{error}</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0 }}>نظام الجمعية{version ? ` (الإصدار ${version})` : ""}</h3>
      <small>يظهر للأهل في رابط «قوانين الجمعية». الموافقة مطلوبة لإرسال الطلب، والتوقيع/الختم مطلوب ويمكن استكماله لاحقًا. النص الافتراضي متاح ما لم تنشر الإدارة نصًا آخر.</small>
      {!saved.trim() && version > 0 && <strong role="alert" style={{ color: "#b91c1c" }}>النص المنشور فارغ: رابط التسجيل لا يستقبل طلبات.</strong>}
      <textarea aria-label="نص نظام الجمعية" rows={8} maxLength={20000} value={text} onChange={(event) => setText(event.target.value)} />
      <div>
        <Button size="sm" variant="secondary" disabled={busy || text === DEFAULT_RULES} onClick={() => setText(DEFAULT_RULES)}>استعادة النص الافتراضي</Button>{" "}
        <Button size="sm" loading={busy} disabled={text === saved} onClick={publish}>نشر</Button>
      </div>
    </div>
  );
}
