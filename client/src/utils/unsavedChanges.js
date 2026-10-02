import { useEffect, useRef } from "react";

// Edit pages report whether they hold unsaved edits so navigation guards only
// warn when there is something to lose. null means "this page doesn't report".
let state = null;

export const setUnsavedChanges = (value) => {
  state = value;
};

export const getUnsavedChanges = () => state;

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
