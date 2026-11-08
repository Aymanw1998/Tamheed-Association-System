// After a failed save: bring the first wrong field into view, focus it and
// give it a short shake (package B, 2026-11-08). `names` are field names in
// page order; the first one found in the page wins.
export function revealFirstError(names) {
  for (const name of names) {
    const field = document.getElementsByName(name)[0];
    if (!field) continue;
    field.setAttribute("aria-invalid", "true");
    if (typeof field.scrollIntoView === "function") field.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof field.focus === "function") field.focus({ preventScroll: true });
    field.classList.remove("field-shake");
    void field.offsetWidth;
    field.classList.add("field-shake");
    setTimeout(() => field.classList.remove("field-shake"), 500);
    return field;
  }
  return null;
}

// A field that is valid again loses its error mark.
export function clearFieldError(name) {
  const field = document.getElementsByName(name)[0];
  if (field) field.removeAttribute("aria-invalid");
}
