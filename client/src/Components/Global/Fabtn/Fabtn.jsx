import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./Fabtn.css";

/**
 * props:
 * - label: טקסט לכפתור
 * - onClick: קליק
 * - visible: אופציונלי, מצב נשלט מבחוץ (אם נותנים – מבטל את ה־observer)
 * - anchor: סלקטור CSS / ref / HTMLElement של הכפתור המקורי בעמוד
 * - root:   סלקטור/ref/HTMLElement של האלמנט שגוללים בו (אם לא חלון)
 * - showWhenNoAnchor: אם אין עוגן בעמוד – האם להראות? ברירת מחדל true
 */
export default function Fabtn({
  label = "הוספה",
  onClick,
  visible,
  anchor,
  root,
  showWhenNoAnchor = true,
}) {
  const [show, setShow] = useState(!!visible);

  useEffect(() => {
    // אם שולטים מבחוץ – לא מפעילים observer
    if (typeof visible === "boolean") {
      setShow(visible);
      return;
    }

    // מציאת העוגן
    const anchorEl =
      typeof anchor === "string"
        ? document.querySelector(anchor)
        : anchor?.current || (anchor instanceof HTMLElement ? anchor : null);

    // מציאת אלמנט הגלילה (אם לא ה־viewport)
    const rootEl =
      typeof root === "string"
        ? document.querySelector(root)
        : root?.current || (root instanceof HTMLElement ? root : null);

    if (!anchorEl) {
      setShow(showWhenNoAnchor);   // אין עוגן → מציגים לפי ברירת מחדל
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting), // אם העוגן לא נראה → הצג FAB
      { root: rootEl || null }
    );
    io.observe(anchorEl);
    return () => io.disconnect();
  }, [visible, anchor, root, showWhenNoAnchor]);

  if (!show) return null;

  return createPortal(
    <button className="fab fab_visible" onClick={onClick} aria-label={label} title={label}>
      ➕ {label}
    </button>,
    document.body
  );
}
