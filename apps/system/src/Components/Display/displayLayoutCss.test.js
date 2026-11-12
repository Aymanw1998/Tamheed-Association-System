// What jsdom cannot see (Codex review, 2026-11-12): in the CSS a tiny
// block keeps its room in a fixed spot and shortens the name instead, and a
// coming day's summary is one line with "…", so the side panel's height is
// bounded and its «+N» sits beside the day's name.
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "Display.module.css"), "utf8");
const rule = (selector) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

test("a tiny block lays name and room in a row; the room never shrinks", () => {
  expect(rule(`.block[data-size="xxs"] .blockName`)).toMatch(/display: flex/);
  expect(rule(`.block[data-size="xxs"] .blockName .name`)).toMatch(/text-overflow: ellipsis/);
  expect(rule(`.block[data-size="xxs"] .roomInline`)).toMatch(/flex: none/);
});

test("a coming day's summary is one line ending in …", () => {
  const line = rule(".sideLine");
  expect(line).toMatch(/white-space: nowrap/);
  expect(line).toMatch(/text-overflow: ellipsis/);
});
