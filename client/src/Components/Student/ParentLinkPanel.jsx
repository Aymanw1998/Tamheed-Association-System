import React, { useCallback, useEffect, useState } from "react";
import Button from "../UI/Button.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus.js";
import { getLink, rotateLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import styles from "./ParentLinkPanel.module.css";

const REASON_LABEL = { exists: "موجود في النظام", pending: "طلب سابق ينتظر" };

const registrationUrl = (token) => `${window.location.origin}/register-student/${token}`;

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-GB");
};

// Admin-only view of the fixed parent-registration link: copy, rotate, this
// week's intake, and the requests refused because the ID was already known.
export default function ParentLinkPanel() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    const res = await getLink();
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError("");
    setInfo(res);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl(info.token));
      toast.success("تم نسخ الرابط");
    } catch {
      toast.warn("لم يتم النسخ، انسخ الرابط يدويًا");
    }
  };

  const rotate = async () => {
    let confirmed = false;
    try {
      confirmed = await ask("", {
        title: "تغيير الرابط",
        message: "الرابط الحالي سيتوقف فورًا، وستحتاج لإرسال الرابط الجديد للأهل. هل تريد المتابعة؟",
        confirmText: "تغيير",
        cancelText: "إلغاء",
        danger: true,
      });
    } catch {
      toast.error("نافذة التأكيد غير جاهزة الآن");
      return;
    }
    if (!confirmed) return;

    setRotating(true);
    const res = await rotateLink();
    setRotating(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("تم تغيير الرابط");
    load();
  };

  if (error) return <p className={styles.error}>{error}</p>;
  if (!info) return <p className={styles.muted}>جاري التحميل...</p>;

  const full = info.usedThisWeek >= info.weeklyLimit;

  return (
    <div className={styles.panel} dir="rtl">
      <div className={styles.linkRow}>
        <input
          className={styles.linkInput}
          readOnly
          dir="ltr"
          value={registrationUrl(info.token)}
          aria-label="رابط تسجيل الأهل"
          onFocus={(e) => e.target.select()}
        />
        <Button size="sm" onClick={copy}>نسخ</Button>
      </div>
      <p className={styles.muted}>أرسل هذا الرابط للأهل. غيّره فقط إذا وصل لأشخاص غرباء.</p>
      <div>
        <Button size="sm" variant="danger" loading={rotating} onClick={rotate}>تغيير الرابط</Button>
      </div>

      <div className={styles.usage}>
        <span>طلبات آخر 7 أيام</span>
        <strong className={full ? styles.full : ""}>{info.usedThisWeek} من {info.weeklyLimit}</strong>
        {full && <small>الرابط لا يستقبل طلبات جديدة حتى ينخفض العدد.</small>}
      </div>

      <h3 className={styles.subTitle}>طلبات رُفضت تلقائيًا</h3>
      {info.attempts.length ? (
        <ul className={styles.attempts}>
          {info.attempts.map((attempt, index) => (
            <li key={`${attempt.tz}-${attempt.createdAt}-${index}`}>
              <strong>{attempt.firstname} {attempt.lastname}</strong>
              <span>هوية {attempt.tz}</span>
              <span dir="ltr">{attempt.father_phone || attempt.mother_phone || attempt.phone || "-"}</span>
              <span>{REASON_LABEL[attempt.reason] || attempt.reason}</span>
              <em>{formatDate(attempt.createdAt)}</em>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>لا توجد طلبات مرفوضة.</p>
      )}
    </div>
  );
}

// The same panel in a modal, for the students page.
export function ParentLinkDialog({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="رابط تسجيل الأهل" dir="rtl">
        <div className={styles.dialogHeader}>
          <h2>رابط تسجيل الأهل</h2>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="إغلاق">✕</Button>
        </div>
        <ParentLinkPanel />
      </div>
    </div>
  );
}
