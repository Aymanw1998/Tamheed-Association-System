import { useCallback, useEffect, useRef, useState } from "react";

// [saved, flash]: flash() turns saved on for a moment, for a Button's
// success state ("تم الحفظ" with a check) right after a save (2026-11-08).
export default function useSavedFlash(ms = 1800) {
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), ms);
  }, [ms]);
  return [saved, flash];
}
