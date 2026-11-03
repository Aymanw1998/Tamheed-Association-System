import React, { useEffect, useMemo, useRef } from "react";
import logo from "../images/logo.png";
import { avatarSvg, GUIDE_NAMES } from "./characters";
import styles from "./Guide.module.css";

const CONFETTI = Array.from({ length: 18 }, (_, i) => i);
const CONFETTI_COLORS = ["#fe9900", "#257a97", "#164d63", "#3299ba", "#ffecd1"];

// The guide character with its logo badge and speech bubble. The parent
// decides what to say and what happens on each button.
export default function Guide({ guide = "tamheed", mood = "explain", title, body, onNext, onPrev, onPause, onSkipChapter, canPrev = true }) {
  const svg = useMemo(() => avatarSvg(guide, mood), [guide, mood]);
  const nextRef = useRef(null);

  // A new step moves focus to the continue button so Enter carries on.
  useEffect(() => {
    if (nextRef.current) nextRef.current.focus();
  }, [title, body]);

  return (
    <div className={styles.root} dir="rtl" data-testid="guide" data-guide={guide} data-mood={mood}>
      {mood === "celebrate" && (
        <div className={styles.confetti} aria-hidden="true">
          {CONFETTI.map((i) => (
            <span
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 6) * 0.15}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className={styles.bubble} role="region" aria-label={GUIDE_NAMES[guide]}>
        <div className={styles.name}>{GUIDE_NAMES[guide]}</div>
        <div aria-live="polite">
          {title && <h3 className={styles.title}>{title}</h3>}
          {body && <p className={styles.body}>{body}</p>}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} ref={nextRef} onClick={onNext}>التالي ←</button>
          <button type="button" className={styles.secondary} onClick={onPrev} disabled={!canPrev}>السابق</button>
          <button type="button" className={styles.secondary} onClick={onPause}>إيقاف مؤقت</button>
          <button type="button" className={styles.link} onClick={onSkipChapter}>تخطّي الفصل</button>
        </div>
      </div>

      <div className={styles.character}>
        <div className={styles.avatar} role="img" aria-label={GUIDE_NAMES[guide]} dangerouslySetInnerHTML={{ __html: svg }} />
        <img className={styles.badge} src={logo} alt="" />
      </div>
    </div>
  );
}
