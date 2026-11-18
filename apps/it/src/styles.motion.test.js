// Codex full review, 2026-11-18: no animation in the IT site may leave a
// transform behind, or every fixed window inside (filters, confirmations)
// would sit on the page instead of the screen, as fixed in the everyday app.
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");

test("the page entrance and the list rows animate with backwards fill only", () => {
  for (const selector of [/\.page-enter \{([^}]*)\}/, /\.list > li, tbody tr \{([^}]*)\}/]) {
    const rule = css.match(selector);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/backwards;/);
    expect(rule[1]).not.toMatch(/\b(both|forwards)\b/);
  }
});

test("no animation in the IT styles keeps its end state", () => {
  const animations = css.match(/animation:[^;]*;/g) || [];
  for (const a of animations) expect(a).not.toMatch(/\b(both|forwards)\b/);
});
