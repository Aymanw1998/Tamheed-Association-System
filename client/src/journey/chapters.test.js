import fs from "fs";
import path from "path";
import { CHAPTERS } from "./chapters";
import { MOODS } from "./guideNames";
import { PERMISSION_TREE, ALL_KEYS } from "../utils/permissionKeys";

// Every chapter registered in chapters/index.js is checked against the rules
// of the guided journey (spec: docs/superpowers/specs/2026-10-22-guided-journey-design.md).

const ARABIC = /[؀-ۿ]/;
// Brand names stay as they are (style guide): PDF.
const LATIN_WORD = { test: (text) => /[A-Za-z]{2,}/.test(String(text).replace(/PDF/g, "")) };
const ACTION_TYPES = ["navigate", "click", "type", "select", "cancelConfirm", "wait"];
// The confirm button of Components/Provides/ConfirmContext.jsx.
const CONFIRM_OK = "confirm-ok";

const SRC = path.join(__dirname, "..");
// The help button lives with the help center (tours/TourProvider.jsx); the
// training-mode document preview is built outside React (journey/demoDocument.js).
const ANCHOR_ROOTS = [
  path.join(SRC, "Components"),
  path.join(SRC, "tours", "TourProvider.jsx"),
  path.join(SRC, "journey", "demoDocument.js"),
];

const sourceFiles = (entry) => {
  const stat = fs.statSync(entry);
  if (stat.isFile()) return /\.(jsx?|tsx?)$/.test(entry) && !/\.test\./.test(entry) ? [entry] : [];
  return fs.readdirSync(entry).flatMap((name) => sourceFiles(path.join(entry, name)));
};

// data-tour="x", every quoted string inside data-tour={...} (one line), and
// setAttribute("data-tour", "x") for overlays built outside React.
const collectAnchors = () => {
  const anchors = new Set();
  ANCHOR_ROOTS.flatMap(sourceFiles).forEach((file) => {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/data-tour="([^"]+)"/g)) anchors.add(m[1]);
    for (const m of text.matchAll(/data-tour=\{([^\n]*)\}/g)) {
      for (const s of m[1].matchAll(/"([^"]+)"/g)) anchors.add(s[1]);
    }
    for (const m of text.matchAll(/setAttribute\(\s*"data-tour"\s*,\s*"([^"]+)"\s*\)/g)) anchors.add(m[1]);
  });
  return anchors;
};

const ANCHORS = collectAnchors();
const allSteps = () => CHAPTERS.flatMap((chapter) => chapter.steps.map((step, index) => ({ chapter, step, index })));
const where = ({ chapter, index }) => `${chapter.id} step ${index + 1}`;
const validOne = (key) => Object.hasOwn(PERMISSION_TREE, key) || ALL_KEYS.includes(key);
const validKey = (key) => key === null || key === undefined
  || (Array.isArray(key) ? key.length > 0 && key.every(validOne) : validOne(key));

test("the journey has all thirteen chapters in order", () => {
  expect(CHAPTERS.map((c) => c.id)).toEqual([
    "journey-intro",
    "journey-dashboard",
    "journey-students",
    "journey-lessons",
    "journey-attendance",
    "journey-reports",
    "journey-files",
    "journey-vehicles",
    "journey-notices",
    "journey-users",
    "journey-audit",
    "journey-assistant",
    "journey-profile",
  ]);
});

test("chapter ids are unique and look like journey-<name>", () => {
  const ids = CHAPTERS.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  ids.forEach((id) => expect(id).toMatch(/^journey-[a-z-]+$/));
});

test("every chapter has an Arabic title, a route and steps", () => {
  CHAPTERS.forEach((chapter) => {
    expect(chapter.title).toMatch(ARABIC);
    expect(chapter.route).toMatch(/^\//);
    expect(Array.isArray(chapter.steps) && chapter.steps.length > 0).toBe(true);
  });
});

test("every title and body is non-empty Arabic, the body at most 220 characters", () => {
  allSteps().forEach((entry) => {
    const { step } = entry;
    const label = where(entry);
    expect([label, typeof step.title === "string" && step.title.trim().length > 0]).toEqual([label, true]);
    expect([label, typeof step.body === "string" && step.body.trim().length > 0]).toEqual([label, true]);
    expect([label, ARABIC.test(step.title) && ARABIC.test(step.body)]).toEqual([label, true]);
    expect([label, LATIN_WORD.test(step.title.replace("{name}", "")) || LATIN_WORD.test(step.body.replace("{name}", ""))]).toEqual([label, false]);
    expect([label, step.body.length <= 220]).toEqual([label, true]);
  });
});

test("every mood is a known mood", () => {
  allSteps().forEach((entry) => expect([where(entry), MOODS.includes(entry.step.mood)]).toEqual([where(entry), true]));
});

test("every action has a known type and what that type needs", () => {
  allSteps().filter(({ step }) => step.action).forEach((entry) => {
    const { action } = entry.step;
    const label = where(entry);
    expect([label, ACTION_TYPES.includes(action.type)]).toEqual([label, true]);
    if (action.type === "navigate") expect([label, action.path]).toEqual([label, expect.stringMatching(/^\//)]);
    if (["click", "type", "select"].includes(action.type)) expect([label, typeof action.target]).toEqual([label, "string"]);
    if (["type", "select"].includes(action.type)) expect([label, typeof action.value]).toEqual([label, "string"]);
    if (action.type === "wait") expect([label, action.ms > 0 && action.ms <= 5000]).toEqual([label, true]);
  });
});

test("every requires is a permission key, a module, or an array of them", () => {
  CHAPTERS.forEach((chapter) => expect([chapter.id, validKey(chapter.requires)]).toEqual([chapter.id, true]));
  allSteps().forEach((entry) => expect([where(entry), validKey(entry.step.requires)]).toEqual([where(entry), true]));
});

test("every target exists as a data-tour anchor in the components", () => {
  allSteps().forEach((entry) => {
    const { step } = entry;
    const targets = [step.target, step.action && step.action.target].filter(Boolean);
    targets.forEach((target) => expect([where(entry), target, ANCHORS.has(target)]).toEqual([where(entry), target, true]));
  });
});

test("a warn step that opens a confirmation is followed by cancelConfirm, never by confirm", () => {
  CHAPTERS.forEach((chapter) => {
    chapter.steps.forEach((step, index) => {
      if (step.mood !== "warn" || !step.action) return;
      const label = `${chapter.id} step ${index + 1}`;
      // The warn step itself never confirms.
      expect([label, step.action.target === CONFIRM_OK]).toEqual([label, false]);
      if (step.action.type !== "click") return;
      const next = chapter.steps[index + 1];
      expect([label, next && next.action && next.action.type]).toEqual([label, "cancelConfirm"]);
    });
  });
});

test("only a warn step's next step cancels, and confirm-ok is clicked only for a save", () => {
  CHAPTERS.forEach((chapter) => {
    chapter.steps.forEach((step, index) => {
      const label = `${chapter.id} step ${index + 1}`;
      if (step.action && step.action.target === CONFIRM_OK) {
        // The step before it pressed a save button, never a delete.
        const prev = chapter.steps[index - 1];
        expect([label, prev && prev.mood !== "warn"]).toEqual([label, true]);
        expect([label, /delete|reject|rotate/.test(String(prev && prev.action && prev.action.target))]).toEqual([label, false]);
      }
    });
  });
});

test("a destructive button is clicked only in a warn step", () => {
  allSteps().forEach((entry) => {
    const { step } = entry;
    const target = step.action && step.action.type === "click" ? step.action.target : "";
    if (/delete|reject|rotate|remove/.test(target)) expect([where(entry), step.mood]).toEqual([where(entry), "warn"]);
  });
});

test("the password change is filled and cancelled, never submitted", () => {
  const clicks = allSteps()
    .filter(({ step }) => step.action && step.action.type === "click")
    .map(({ step }) => step.action.target);
  expect(clicks).not.toContain("password-submit");
  expect(clicks).not.toContain("profile-save");
  const profile = CHAPTERS.find((c) => c.id === "journey-profile");
  const targets = profile.steps.map((s) => s.action && s.action.target);
  const typed = profile.steps.map((s, i) => (s.action && s.action.type === "type" && /^password-/.test(s.action.target) ? i : -1)).filter((i) => i >= 0);
  expect(typed.length).toBe(3);
  expect(targets.indexOf("password-cancel")).toBeGreaterThan(Math.max(...typed));
});

test("the files chapter uploads without the file picker", () => {
  const files = CHAPTERS.find((c) => c.id === "journey-files");
  const actions = files.steps.map((s) => s.action).filter(Boolean);
  expect(actions).toContainEqual({ type: "click", target: "files-upload" });
  // Nothing is typed or selected into a file input.
  actions.filter((a) => a.type === "type" || a.type === "select").forEach((a) => expect(a.target).not.toMatch(/upload|file-input/));
});
test("every step text is short: body up to 80 characters, title up to 4 words", () => {
  const tooLong = [];
  CHAPTERS.forEach((chapter) => {
    chapter.steps.forEach((step, i) => {
      const where = `${chapter.id}#${i}`;
      if (step.body && step.body.length > 80) tooLong.push(`${where} body (${step.body.length})`);
      if (step.title && step.title.trim().split(/\s+/).length > 4) tooLong.push(`${where} title`);
    });
  });
  expect(tooLong).toEqual([]);
});
