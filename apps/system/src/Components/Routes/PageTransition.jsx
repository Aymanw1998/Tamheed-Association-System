import React, { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Replays a short fade-in on each navigation (package A, 2026-11-08) without
// remounting the page: only the class is restarted, so a page keeps its state
// when only its query or hash changes.
export default function PageTransition({ children }) {
  const ref = useRef(null);
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.classList.remove("page-enter");
    void node.offsetWidth; // restart the animation
    node.classList.add("page-enter");
  }, [pathname]);
  return <div ref={ref} className="page-enter">{children}</div>;
}
