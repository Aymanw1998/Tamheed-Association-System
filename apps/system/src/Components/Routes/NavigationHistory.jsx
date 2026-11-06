import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { initialHistory, parentDestination, recordLocation, restorePageScroll } from "../../utils/navigationHistory";
import { getStoredPermissions } from "../../utils/session";
import { canAccessPath } from "../../utils/routeAccess";
import { confirmLeave } from "../../utils/unsavedChanges";
import styles from "./NavigationHistory.module.css";

export default function NavigationHistory() {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const [history, setHistory] = useState(() => initialHistory(location));
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(null);
  const currentKey = useRef(location.key);
  const scroll = useRef(new Map());
  const previousKey = useRef(location.key);
  currentKey.current = location.key;
  // The history stays mounted in the signed-in layout even when the header
  // remounts after an access change; only its buttons move into the header.
  useLayoutEffect(() => {
    const attach = () => setTarget(document.getElementById("header-history"));
    attach();
    const container = document.getElementById("header")?.parentElement;
    const observer = container ? new MutationObserver(attach) : null;
    if (container) observer.observe(container, { childList: true });
    return () => observer?.disconnect();
  }, []);
  useLayoutEffect(() => {
    let stopRestoring;
    setHistory((previous) => recordLocation(previous, location, action));
    if (action === "POP" && previousKey.current !== location.key) {
      const position = scroll.current.get(location.key);
      if (position) stopRestoring = restorePageScroll(position);
    }
    previousKey.current = location.key;
    return () => { stopRestoring?.(); scroll.current.set(location.key, { x: window.scrollX, y: window.scrollY }); };
  }, [location, action]);

  const allowed = (entry) => entry && canAccessPath(entry.pathname, getStoredPermissions());
  const back = history.entries[history.index - 1];
  const forward = history.entries[history.index + 1];
  let parent = parentDestination(location.pathname);
  if (!canAccessPath(parent, getStoredPermissions())) parent = "/dashboard";
  const canGoBack = allowed(back) || (!back && parent !== location.pathname);
  const canGoForward = allowed(forward);
  const go = async (direction) => {
    if (busy) return;
    const key = location.key;
    setBusy(true);
    try {
      if (!(await confirmLeave(location.pathname)) || key !== currentKey.current) return;
      if (direction === -1 && allowed(back)) navigate(-1);
      else if (direction === 1 && allowed(forward)) navigate(1);
      else if (direction === -1 && !back && parent !== location.pathname) navigate(parent, { replace: true });
    } finally { setBusy(false); }
  };
  if (!target || (!canGoBack && !canGoForward)) return null;
  return createPortal(<nav className={styles.bar} aria-label="التنقل بين الصفحات" dir="rtl">
    {canGoBack && <button type="button" aria-label="رجوع" title="رجوع" onClick={() => go(-1)} disabled={busy}><span aria-hidden="true">→</span></button>}
    {canGoForward && <button type="button" aria-label="تقدّم" title="تقدّم" onClick={() => go(1)} disabled={busy}><span aria-hidden="true">←</span></button>}
  </nav>, target);
}
