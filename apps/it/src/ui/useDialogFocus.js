import { useEffect } from "react";

// Keyboard focus for a modal window (Codex full review, 2026-11-18): on open
// focus moves into the window, Tab and Shift+Tab stay inside it, and on close
// focus goes back to what opened it. ref: the window element.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const focusableIn = (root) => (root ? [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest("[hidden]")) : []);

export default function useDialogFocus(open, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const root = ref.current;
    if (!root) return undefined;
    const first = focusableIn(root)[0];
    if (first) first.focus();
    else {
      if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
      root.focus();
    }
    const onKey = (event) => {
      if (event.key !== "Tab") return;
      const items = focusableIn(root);
      if (!items.length) { event.preventDefault(); return; }
      const head = items[0];
      const tail = items[items.length - 1];
      const inside = root.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === head || !inside)) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && (document.activeElement === tail || !inside)) { event.preventDefault(); head.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, [open, ref]);
}
