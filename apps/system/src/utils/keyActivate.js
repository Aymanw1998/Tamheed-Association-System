// Keyboard for a clickable element that is not a <button> (accessibility,
// owner, 2026-11-17): Enter or Space runs its click, as a button would.
export function activateOnKey(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target !== event.currentTarget) return; // a button inside handles itself
  event.preventDefault();
  event.currentTarget.click();
}

// Spread on the element: {...asButton("label")}.
export const asButton = (label) => ({ role: "button", tabIndex: 0, onKeyDown: activateOnKey, ...(label ? { "aria-label": label } : {}) });
