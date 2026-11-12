// The approve-user window opened off-screen on a long page and nothing could
// be chosen (owner, 2026-11-12). A transform left on the page after its
// entrance animation pins every fixed window inside the page to the page
// instead of the screen, so the animation must not keep its last frame.
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "..", "index.css"), "utf8");

test("the page entrance animation leaves no transform behind", () => {
  const rule = css.match(/\.page-enter \{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/animation: page-in .* backwards;/);
  expect(rule[1]).not.toMatch(/\b(both|forwards)\b/);
});
