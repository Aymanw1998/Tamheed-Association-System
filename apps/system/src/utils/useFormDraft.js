import { useCallback, useEffect, useRef, useState } from "react";

// Unsaved form text survives a closed tab or a reload (package B, 2026-11-08).
// The chosen fields are kept on this device under draft:<user>:<form>, for at
// most DRAFT_TTL_MS; sign-out clears all local storage (and so every draft),
// and a successful save calls clear(). Nothing is restored silently: when a
// newer draft than the opened record exists, `pending` holds it until the user
// restores or discards it.
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 600;

const pick = (source, fields) => Object.fromEntries(fields.map((f) => [f, source?.[f] ?? null]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function readDraft(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft.at !== "number" || Date.now() - draft.at > DRAFT_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch { return null; }
}
const writeDraft = (key, data) => { try { window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or blocked */ } };
const dropDraft = (key) => { try { window.localStorage.removeItem(key); } catch { /* blocked */ } };

// key: null while the form is not ready (still loading) or must not keep a
// draft (read-only). baseline: the record as opened (or the empty form).
export default function useFormDraft({ key, form, baseline, fields, setForm }) {
  const [pending, setPending] = useState(null);
  const resolved = useRef(false);
  const timer = useRef(null);

  // On opening: offer a stored draft that differs from what was opened.
  useEffect(() => {
    resolved.current = false;
    setPending(null);
    if (!key || !baseline) return;
    const draft = readDraft(key);
    if (draft && !same(draft.data, pick(baseline, fields))) setPending(draft);
    else { if (draft) dropDraft(key); resolved.current = true; }
    // fields is a constant list per form.
  }, [key, baseline]);

  // While editing: keep the changed fields, or drop the draft when they match again.
  useEffect(() => {
    if (!key || !baseline || !resolved.current) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const data = pick(form, fields);
      if (same(data, pick(baseline, fields))) dropDraft(key);
      else writeDraft(key, data);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer.current);
  }, [key, baseline, form]);

  const restore = useCallback(() => {
    if (!pending) return;
    setForm((current) => ({ ...current, ...pending.data }));
    setPending(null);
    resolved.current = true;
  }, [pending, setForm]);

  const discard = useCallback(() => {
    if (key) dropDraft(key);
    setPending(null);
    resolved.current = true;
  }, [key]);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    if (key) dropDraft(key);
  }, [key]);

  return { pending, restore, discard, clear };
}
