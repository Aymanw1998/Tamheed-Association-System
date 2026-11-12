// The wall's entry animations (owner, 2026-11-12) must not keep their last
// frame: a kept frame overrides the dimmed look of ended lessons (opacity)
// and leaves a transform behind. Only the progress bar may keep its end.
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "Display.module.css"), "utf8");

test("entry animations fill backwards only", () => {
  const uses = css.match(/animation:[^;]*\b(fade-in|rise|pop)\b[^;]*;/g) || [];
  expect(uses.length).toBeGreaterThan(4);
  uses.forEach((rule) => {
    expect(rule).not.toMatch(/\b(both|forwards)\b/);
    expect(rule).toMatch(/\bbackwards\b/);
  });
});
