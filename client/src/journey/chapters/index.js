import intro from "./intro";
import dashboard from "./dashboard";
import students from "./students";
import lessons from "./lessons";
import attendance from "./attendance";
import reports from "./reports";
import files from "./files";
import vehicles from "./vehicles";
import notices from "./notices";
import users from "./users";
import audit from "./audit";
import assistant from "./assistant";
import profile from "./profile";

// HOW TO ADD A CHAPTER
// Add a file next to this one exporting { id: "journey-<name>", title, route,
// requires, steps } and list it here in the order the user meets it.
// Each step: { target (a data-tour value, or null), mood ("explain" | "point" |
// "warn" | "celebrate"), title, body (at most two sentences), requires?, action? }.
// action is what the guide does when the user presses «التالي» on that step:
//   { type: "navigate", path } | { type: "click", target } | { type: "type", target, value }
//   | { type: "select", target, value } | { type: "cancelConfirm" } | { type: "wait", ms }
// type and select are for text fields and <select> only; for a checkbox or a
// radio button use click (it toggles it as a real click would).
// A step whose target is not on screen is skipped. All text is Arabic
// (docs/arabic-style-guide.md); "{name}" becomes the guide's name.
// Each chapter's id is its tour id on the server (done / skipped).
// Saves that ask «تأكيد» are confirmed with { type: "click", target: "confirm-ok" };
// a delete is shown with mood "warn" and then { type: "cancelConfirm" }, never confirmed.
export const CHAPTERS = [
  intro, dashboard, students, lessons, attendance, reports,
  files, vehicles, notices, users, audit, assistant, profile,
];
