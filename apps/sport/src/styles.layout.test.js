// The bottom bar floated in the middle of the page on an iPhone (owner,
// 2026-11-04): position: fixed follows Safari's layout viewport, which can be
// shorter than the screen. In the page's flow it can never cover the content.
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const rule = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
};

test("the bar stays in the page's flow, stuck to the bottom", () => {
  const tabs = rule(".tabs");
  expect(tabs).toMatch(/position: sticky/);
  expect(tabs).toMatch(/bottom: 0/);
  expect(tabs).not.toMatch(/position: fixed/);
  expect(tabs).not.toMatch(/translateX/);
});

test("the page fills the whole screen and keeps the bar at its end", () => {
  const app = rule(".app");
  expect(app).toMatch(/min-height: 100vh/);
  expect(app).toMatch(/display: flex/);
  expect(app).toMatch(/flex-direction: column/);
  expect(rule(".content")).toMatch(/flex: 1 0 auto/);
});

test("the page leaves no room reserved for a floating bar, and does not break sticky", () => {
  const app = rule(".app");
  expect(app).not.toMatch(/padding-bottom/);
  // overflow-x: hidden would make the page its own scroller and sticky would stop working.
  expect(app).toMatch(/overflow-x: clip/);
});

test("a computer gets a wide page; what phones see stays outside the media query", () => {
  const at = css.indexOf("@media (min-width: 900px)");
  expect(at).toBeGreaterThan(-1);
  const wide = css.slice(at);
  expect(wide).toMatch(/\.app \{ max-width: none;/);
  expect(wide).toMatch(/\.home-grid \{ display: grid;/);
  expect(wide).toMatch(/\.tabs \{ order: 1; position: sticky; top: 0;/);
  expect(css.slice(0, at)).toMatch(/\.app \{\s+max-width: 480px;/);
  expect(css.slice(0, at)).not.toMatch(/\.home-grid/);
});
