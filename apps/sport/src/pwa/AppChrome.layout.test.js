// The update and install bars sat over the buttons at the end of the page (owner, 2026-11-04).
const fs = require("fs");
const path = require("path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("the bars are in the page's flow, not fixed", () => {
  const chrome = read("pwa/AppChrome.jsx");
  expect(chrome).toContain('position: "sticky"');
  expect(chrome).not.toContain('position: "fixed",\n  insetInline');
});

test("signed in, the bars come after the content and just before the tabs", () => {
  const app = read("App.jsx");
  const main = app.indexOf("</main>");
  const chrome = app.indexOf("{chrome}", main);
  const tabs = app.indexOf("<BottomTabs tab={tab}");
  expect(chrome).toBeGreaterThan(main);
  expect(chrome).toBeLessThan(tabs);
  expect(app.indexOf("{chrome}", tabs)).toBe(-1);
});

test("on the waiting and error screens the bars are outside the centered note", () => {
  const app = read("App.jsx");
  for (const note of app.split('<div className="center-note">').slice(1)) {
    expect(note.slice(0, note.indexOf("</div>"))).not.toContain("{chrome}");
  }
});
