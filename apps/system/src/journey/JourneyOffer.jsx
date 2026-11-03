import React, { useEffect, useMemo, useRef } from "react";
import logo from "../images/logo.png";
import { avatarSvg, GUIDE_NAMES } from "./characters";
import styles from "./Guide.module.css";

// The guide offers the journey: the first time («ابدأ الآن / لاحقًا / تخطٍّ»),
// or to resume from the first chapter left («نكمل من فصل X؟»).
export default function JourneyOffer({ guide = "tamheed", kind, chapterTitle, onStart, onLater, onSkip }) {
  const svg = useMemo(() => avatarSvg(guide, "explain"), [guide]);
  const startRef = useRef(null);
  const name = GUIDE_NAMES[guide];
  const resume = kind === "resume";

  useEffect(() => {
    if (startRef.current) startRef.current.focus();
  }, [kind]);

  const title = resume ? `نكمل من فصل «${chapterTitle}»؟` : `أهلًا، أنا ${name}`;
  const body = resume
    ? "توقّفنا في المرة السابقة قبل هذا الفصل. سأبدأ معك من أوله."
    : "سأعرّفك على النظام في مسار تدريبي قصير، وأعمل أمامك على بيانات تجريبية لا تُحفظ. هل نبدأ؟";

  return (
    <div className={styles.root} dir="rtl" data-journey-ui="" data-testid="journey-offer" data-guide={guide}>
      <div className={styles.bubble} role="region" aria-label={name}>
        <div className={styles.name}>{name}</div>
        <div aria-live="polite">
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.body}>{body}</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} ref={startRef} onClick={onStart}>
            {resume ? "نكمل الآن" : "ابدأ الآن"}
          </button>
          <button type="button" className={styles.secondary} onClick={onLater}>لاحقًا</button>
          {!resume && (
            <button type="button" className={styles.link} onClick={onSkip}>تخطٍّ</button>
          )}
        </div>
      </div>

      <div className={styles.character}>
        <div className={styles.avatar} role="img" aria-label={name} dangerouslySetInnerHTML={{ __html: svg }} />
        <img className={styles.badge} src={logo} alt="" />
      </div>
    </div>
  );
}
