import intro from "./intro";

// HOW TO ADD A CHAPTER
// Add a file next to this one exporting { id: "journey-<name>", title, route,
// requires, steps } and list it here in the order the user meets it.
// Each step: { target (a data-tour value, or null), mood ("explain" | "point" |
// "warn" | "celebrate"), title, body (at most two sentences), requires?, action? }.
// action is what the guide does when the user presses «التالي» on that step:
//   { type: "navigate", path } | { type: "click", target } | { type: "type", target, value }
//   | { type: "select", target, value } | { type: "cancelConfirm" } | { type: "wait", ms }
// A step whose target is not on screen is skipped. All text is Arabic
// (docs/arabic-style-guide.md); "{name}" becomes the guide's name.
// Each chapter's id is its tour id on the server (done / skipped).
export const CHAPTERS = [intro];
