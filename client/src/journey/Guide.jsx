import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import logo from "../images/logo.png";
import { avatarSvg, GUIDE_NAMES } from "./characters";
import styles from "./Guide.module.css";

const CONFETTI = Array.from({ length: 18 }, (_, i) => i);
const CONFETTI_COLORS = ["#fe9900", "#257a97", "#164d63", "#3299ba", "#ffecd1"];

// The guide character with its logo badge and speech bubble. The parent
// decides what to say and what happens on each button.
export default function Guide({ guide = "tamheed", mood = "explain", title, body, targetRect, onNext, onPrev, onPause, onSkipChapter, canPrev = true }) {
  const svg = useMemo(() => avatarSvg(guide, mood), [guide, mood]);
  const bubbleRef = useRef(null);
  const nextRef = useRef(null);
  const headId = "guide-arrow-head-" + useId().replace(/:/g, "");
  const [from, setFrom] = useState(null);

  const pointing = mood === "point" && targetRect;

  // The arrow starts at the top edge of the bubble; follow it on resize and scroll.
  useLayoutEffect(() => {
    if (!pointing || !bubbleRef.current) {
      setFrom(null);
      return undefined;
    }
    const measure = () => {
      if (!bubbleRef.current) return;
      const r = bubbleRef.current.getBoundingClientRect();
      setFrom({ x: r.left + r.width / 2, y: r.top });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [pointing, targetRect, title, body]);

  // A new step moves focus to the continue button so Enter carries on.
  useEffect(() => {
    if (nextRef.current) nextRef.current.focus();
  }, [title, body]);

  const to = pointing ? { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 } : null;
  const path = from && to ? `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - 60} ${to.x} ${to.y}` : null;

  return (
    <div className={styles.root} dir="rtl" data-testid="guide" data-guide={guide} data-mood={mood}>
      {path && (
        <svg className={styles.arrow} aria-hidden="true">
          <defs>
            <marker id={headId} markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fe9900" />
            </marker>
          </defs>
          <path d={path} className={styles.arrowPath} markerEnd={`url(#${headId})`} />
        </svg>
      )}

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

      <div className={styles.bubble} ref={bubbleRef} role="region" aria-label={GUIDE_NAMES[guide]}>
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
