import { useEffect, useRef, useState } from "react";
import { avatarSvg } from "./characters";
import { GUIDE_NAMES, guideFor } from "./guideNames";
import { guideSteps } from "./guideSteps";

// A bottom sheet: the guide's avatar beside a speech bubble, four short steps.
export default function FirstVisitGuide({ firstname, gender, onClose }) {
  const guide = guideFor(gender);
  const steps = guideSteps(firstname, guide);
  const [i, setI] = useState(0);
  const bubble = useRef(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => {
    if (bubble.current) bubble.current.focus();
  }, [i]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="guide-overlay" onKeyDown={onKeyDown}>
      <div className="guide-sheet" role="dialog" aria-modal="true" aria-label={`جولة مع ${GUIDE_NAMES[guide]}`}>
        <div className="guide-row">
          <div className="guide-avatar" role="img" aria-label={GUIDE_NAMES[guide]} dangerouslySetInnerHTML={{ __html: avatarSvg(guide, step.mood) }} />
          <div className="guide-bubble" ref={bubble} tabIndex={-1} aria-live="polite">
            <b className="guide-name">{GUIDE_NAMES[guide]}</b>
            <p>{step.text}</p>
          </div>
        </div>
        <div className="guide-dots" aria-hidden="true">
          {steps.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}
        </div>
        <div className="guide-actions">
          {!last && <button type="button" className="guide-skip" onClick={onClose}>تخطّي</button>}
          {i > 0 && <button type="button" className="guide-prev" onClick={() => setI(i - 1)}>السابق</button>}
          <button type="button" className="guide-next" onClick={last ? onClose : () => setI(i + 1)}>
            {last ? "لنبدأ" : "التالي"}
          </button>
        </div>
      </div>
    </div>
  );
}
