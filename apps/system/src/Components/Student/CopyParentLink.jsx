import React, { useEffect, useState } from "react";
import { getLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import Button from "../UI/Button.jsx";
import { openWhatsApp, REGISTRATION_TEXT } from "../../utils/whatsApp";

// Fetch in advance so clipboard.writeText runs during the user's click,
// including on browsers that require transient user activation.
export default function CopyParentLink(props) {
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(false);
    getLink().then((res) => {
      if (!live) return;
      if (res?.ok && res.token) setToken(res.token);
      else setError(true);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [attempt]);
  const copy = () => {
    if (error) { setAttempt((value) => value + 1); return; }
    try {
      Promise.resolve(navigator.clipboard.writeText(`${window.location.origin}/register-student/${token}`))
        .then(() => toast.success("تم نسخ الرابط"))
        .catch(() => toast.error("تعذّر نسخ الرابط، حاول مرة أخرى."));
    } catch { toast.error("تعذّر نسخ الرابط، حاول مرة أخرى."); }
  };
  const url = `${window.location.origin}/register-student/${token}`;
  // «إرسال بواتساب» next to the copy button (owner, 2026-11-16).
  return <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8 }}>
    <Button variant="secondary" {...props} disabled={!token && !error} onClick={copy}>
      {error ? "إعادة تحميل رابط الأهل" : "نسخ رابط تسجيل الأهل"}
    </Button>
    <Button variant="success" disabled={!token} onClick={() => openWhatsApp(REGISTRATION_TEXT, url)}>إرسال بواتساب</Button>
  </span>;
}
