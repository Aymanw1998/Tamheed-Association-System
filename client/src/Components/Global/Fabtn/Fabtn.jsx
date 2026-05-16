import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./Fabtn.css";

/**
 * props:
 * ملاحظة عربية
 * ملاحظة عربية
 * ملاحظة عربية
 * ملاحظة عربية
 * ملاحظة عربية
 * ملاحظة عربية
 */
export default function Fabtn({
  label = "إضافة",
  onClick,
  visible,
  anchor,
  root,
  showWhenNoAnchor = true,
}) {
  const [show, setShow] = useState(!!visible);

  useEffect(() => {
    // ملاحظة عربية
    if (typeof visible === "boolean") {
      setShow(visible);
      return;
    }

    // ملاحظة عربية
    const anchorEl =
      typeof anchor === "string"
        ? document.querySelector(anchor)
        : anchor?.current || (anchor instanceof HTMLElement ? anchor : null);

    // ملاحظة عربية
    const rootEl =
      typeof root === "string"
        ? document.querySelector(root)
        : root?.current || (root instanceof HTMLElement ? root : null);

    if (!anchorEl) {
      setShow(showWhenNoAnchor);   // ملاحظة عربية
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting), // ملاحظة عربية
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
