import { useEffect, useRef } from "react";
import { ask } from "../Components/Provides/confirmBus";

// Edit pages report whether they hold unsaved edits so navigation guards only
// warn when there is something to lose. null means "this page doesn't report".
let state = null;

export const setUnsavedChanges = (value) => {
  state = value;
};

export const getUnsavedChanges = () => state;

// Pages whose edits a navigation away could lose.
export const EDIT_PATTERNS = [
  /^\/students\/(new|[^/]+)$/,
  /^\/users\/(new|[^/]+)$/,
  /^\/lessons\/(new|[^/]+)$/,
  /^\/vehicles\/(new|[^/]+)$/,
  /^\/subs\/(new|[^/]+)$/,
  /^\/selectSubfor\/[^/]+$/,
  /^\/regnextmonth$/,
];

// Leaving `pathname` needs a confirmation: an edit page that has unsaved edits or
// does not report (null). Only a page that says "nothing to lose" (false) is let go.
export const needsLeaveConfirm = (pathname, unsaved = state) =>
  EDIT_PATTERNS.some((pattern) => pattern.test(String(pathname || ""))) && unsaved !== false;

// Asks before leaving an edit page; resolves true when it is fine to navigate.
// Used by the menu and by the product tour before they move to another page.
export async function confirmLeave(pathname = window.location.pathname, confirm = ask) {
  if (!needsLeaveConfirm(pathname)) return true;
  return Boolean(await confirm("navigate"));
}

// Snapshot `value` once `ready`, then flag any later difference as unsaved.
export function useUnsavedChanges(value, ready) {
  const baseline = useRef(null);
  const serialized = JSON.stringify(value);

  useEffect(() => {
    if (!ready) return;
    if (baseline.current === null) baseline.current = serialized;
    setUnsavedChanges(serialized !== baseline.current);
  }, [serialized, ready]);

  useEffect(() => () => setUnsavedChanges(null), []);
}
