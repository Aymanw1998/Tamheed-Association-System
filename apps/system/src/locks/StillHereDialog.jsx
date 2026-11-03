import React from "react";
import "../Components/Provides/ConfirmContext.css";

// «هل ما زلت هنا؟» uses the same look as the app's confirm dialog.
export default function StillHereDialog({ onStay }) {
  return (
    <div className="c-overlay" role="dialog" aria-modal="true">
      <div className="c-dialog">
        <div className="c-header">
          <h3>هل ما زلت هنا؟</h3>
        </div>
        <div className="c-body">
          <p>لم نلاحظ أي نشاط منذ فترة. إن لم تجب خلال دقيقة يُحرَّر هذا العنصر ويصبح للقراءة فقط.</p>
        </div>
        <div className="c-actions">
          <button className="c-btn c-btn-primary" autoFocus onClick={onStay}>
            نعم، ما زلت هنا
          </button>
        </div>
      </div>
    </div>
  );
}
