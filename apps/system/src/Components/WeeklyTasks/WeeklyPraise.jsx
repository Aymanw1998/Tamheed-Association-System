import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../Provides/ConfirmContext.css";
import { getMyTasks, markPraiseSeen } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import { isDemo } from "../../journey/demoMode";
import { getStoredUserId } from "../../utils/session";

// Unfinished current-week tasks remind on every signed-in layout mount.
export default function WeeklyPraise() {
  const [notice, setNotice] = useState(null);
  const navigate = useNavigate();
  const userId = getStoredUserId();

  useEffect(() => {
    setNotice(null);
    if (isDemo()) return undefined;
    let alive = true;
    getMyTasks().then((res) => {
      if (!alive || !res.ok) return;
      const remaining = (res.tasks || []).filter((task) => !task.done).length;
      if (remaining || res.praise) setNotice({ ...res, remaining });
    });
    return () => { alive = false; };
  }, [userId]);

  if (!notice) return null;
  const close = () => {
    if (notice.praise) markPraiseSeen(notice.praiseWeek);
    setNotice(null);
  };
  return (
    <div className="c-overlay" role="dialog" aria-modal="true" aria-labelledby="weekly-praise-title" dir="rtl">
      <div className="c-dialog">
        <div className="c-header"><h3 id="weekly-praise-title">{notice.remaining ? "لديك مهمات أسبوعية لم تُنجز بعد" : "كل الاحترام!"}</h3></div>
        <div className="c-body">
          {notice.remaining > 0 && <p>بقيت لمجموعتك {notice.remaining} مهمات هذا الأسبوع. يُرجى إنجازها وتأكيدها قبل نهاية يوم السبت.</p>}
          {notice.praise && <p>{notice.greeting || "بارك الله فيكم على مجهودكم"} — أنهت مجموعتك مهمات الأسبوع الذي بدأ في {notice.praiseWeek}.</p>}
        </div>
        <div className="c-actions">
          <button type="button" className="c-btn" onClick={close}>إغلاق</button>
          {notice.remaining > 0 && <button type="button" className="c-btn c-btn-primary" onClick={() => { close(); navigate("/weekly-tasks"); }}>عرض المهمات</button>}
        </div>
      </div>
    </div>
  );
}
