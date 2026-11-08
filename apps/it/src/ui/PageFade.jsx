import React, { useLayoutEffect, useRef } from "react";

// Replays a short fade-in when the screen changes, without remounting it
// (the same as the everyday app's PageTransition, 2026-11-08).
export default function PageFade({ path, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.classList.remove("page-enter");
    void node.offsetWidth;
    node.classList.add("page-enter");
  }, [path]);
  return <div ref={ref} className="page-enter">{children}</div>;
}
