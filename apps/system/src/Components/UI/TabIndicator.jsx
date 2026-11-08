import React, { useLayoutEffect, useRef } from "react";
import styles from "./TabIndicator.module.css";

// Put as the last child of a role="tablist": it slides under the tab whose
// aria-selected is true (package A, 2026-11-08). "underline" draws a bar,
// "pill" a filled background behind the selected tab's text. The tabs keep
// their own markup, keyboard and aria; this only follows aria-selected.
export default function TabIndicator({ variant = "underline" }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const bar = ref.current;
    const list = bar?.parentElement;
    if (!list) return undefined;
    list.dataset.tabIndicator = variant;
    if (window.getComputedStyle(list).position === "static") list.style.position = "relative";
    let frame = 0;
    const place = () => {
      const tab = list.querySelector('[role="tab"][aria-selected="true"]');
      if (!tab || !tab.offsetWidth) { bar.style.opacity = "0"; return; }
      bar.style.opacity = "1";
      bar.style.width = `${tab.offsetWidth}px`;
      bar.style.transform = `translateX(${tab.offsetLeft}px)`;
      if (variant === "pill") {
        bar.style.top = `${tab.offsetTop}px`;
        bar.style.height = `${tab.offsetHeight}px`;
      } else {
        bar.style.top = `${tab.offsetTop + tab.offsetHeight - 3}px`;
      }
    };
    place();
    // The first position is set without sliding in from the corner.
    frame = window.requestAnimationFrame(() => bar.classList.add(styles.ready));
    const watch = new MutationObserver(place);
    watch.observe(list, { attributes: true, attributeFilter: ["aria-selected"], subtree: true, childList: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    resize?.observe(list);
    window.addEventListener("resize", place);
    return () => {
      window.cancelAnimationFrame(frame);
      watch.disconnect();
      resize?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [variant]);
  return <span ref={ref} aria-hidden="true" className={`${styles.indicator} ${styles[variant] || ""}`} />;
}
