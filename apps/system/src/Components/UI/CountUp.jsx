import { useEffect, useRef, useState } from "react";

// A number that counts up to its value when it first appears or changes
// (package A, 2026-11-08). Anything that is not a whole number, a browser
// without matchMedia, or the "reduce motion" setting shows the value at once.
const canAnimate = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
  && typeof window.requestAnimationFrame === "function"
  && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function CountUp({ value, duration = 700 }) {
  const target = Number(value);
  const numeric = Number.isInteger(target) && target >= 0 && String(value).trim() !== "";
  const [shown, setShown] = useState(() => (numeric && canAnimate() ? 0 : value));
  const from = useRef(0);

  useEffect(() => {
    if (!numeric || !canAnimate()) { setShown(value); return undefined; }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(begin + (target - begin) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, numeric, target, duration]);

  return shown;
}
