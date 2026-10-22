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
// requires (on a chapter or a step) is a permission key or module, an array of
// them (all are required), or null for everyone.
// Each step: { target (a data-tour value, or null), mood ("explain" | "point" |
// "warn" | "celebrate"), title, body (at most two sentences and 220
// characters), requires?, action? }.
// Put each data-tour anchor on BOTH layouts a screen has (the desktop table
// and the phone cards): the visible one is used, and a step whose target never
// shows on the user's layout is skipped.
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
// Every save a chapter makes must have a handler in ../demoRoutes.js (with a
// test in demoRoutes.test.js): in training mode an unknown write is blocked
// (409 DEMO_BLOCKED) and the screen shows an error instead of the result.
// Demo data lives in ../demoData.js; name new demo records so they read as
// clearly fake (for example ending in «(تجريبي)»).
export const CHAPTERS = [
  intro, dashboard, students, lessons, attendance, reports,
  files, vehicles, notices, users, audit, assistant, profile,
];
